import { useState, useRef, useCallback, useEffect } from 'react';
import { UserProfile } from '../types';

function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    let s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface VoiceAgentCallbacks {
  onUserTranscript?: (text: string) => void;
  onProvisionalUserTranscript?: (text: string) => void;
  onUserTranscriptEmpty?: () => void;
  onAgentTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
  onToolCall?: (name: string, args: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>;
  onError?: (message: string) => void;
}

export function useVoiceAgent(callbacks: VoiceAgentCallbacks) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceURI, setVoiceURIState] = useState<string>(() => localStorage.getItem('mentor_ai_voice') || "Zephyr");

  const setVoiceURI = useCallback((v: string) => {
    setVoiceURIState(v);
    try { localStorage.setItem('mentor_ai_voice', v); } catch (e) {}
  }, []);

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const smoothedLevelRef = useRef(0);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const smoothedOutputLevelRef = useRef(0);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isSetupCompleteRef = useRef<boolean>(false);
  const voiceURIRef = useRef(voiceURI);
  voiceURIRef.current = voiceURI;

  const playAudioChunk = async (base64Audio: string) => {
    if (!outputAudioCtxRef.current) return;
    const audioCtx = outputAudioCtxRef.current;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const dataView = new DataView(bytes.buffer);
    const numSamples = dataView.byteLength / 2;
    const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < numSamples; i++) {
      const int16 = dataView.getInt16(i * 2, true);
      channelData[i] = int16 / (int16 < 0 ? 0x8000 : 0x7fff);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    // Route through the output analyser so the UI can pulse with the mentor's voice
    if (outputAnalyserRef.current) {
      source.connect(outputAnalyserRef.current);
    } else {
      source.connect(audioCtx.destination);
    }
    activeSourcesRef.current.push(source);

    if (nextStartTimeRef.current < audioCtx.currentTime) {
      nextStartTimeRef.current = audioCtx.currentTime;
    }
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;

    setIsPlaying(true);

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (audioCtx.currentTime >= nextStartTimeRef.current - 0.05) {
        setIsPlaying(false);
      }
    };
  };

  const handleToolCall = async (toolCall: { id: string; name: string; args: Record<string, any> }) => {
    let result: Record<string, any> = { ok: false, error: 'לא נמצא מטפל לכלי הזה' };
    try {
      const handler = callbacksRef.current.onToolCall;
      if (handler) {
        result = (await handler(toolCall.name, toolCall.args)) || { ok: true };
      }
    } catch (e: any) {
      result = { ok: false, error: e?.message || 'שגיאה בביצוע הפעולה' };
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        toolResponse: { id: toolCall.id, name: toolCall.name, result }
      }));
    }
  };

  const startLiveSession = useCallback(async (initialTextContext?: string, profile?: UserProfile | null, kickoff?: boolean) => {
    if (wsRef.current) return;
    setIsConnecting(true);

    isSetupCompleteRef.current = false;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/live?voice=${encodeURIComponent(voiceURIRef.current)}`);
    wsRef.current = ws;

    const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    inputAudioCtxRef.current = inputAudioCtx;
    outputAudioCtxRef.current = outputAudioCtx;
    nextStartTimeRef.current = 0;

    // Output analyser: playback sources route through it to the speakers
    const outAnalyser = outputAudioCtx.createAnalyser();
    outAnalyser.fftSize = 256;
    outAnalyser.connect(outputAudioCtx.destination);
    outputAnalyserRef.current = outAnalyser;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      mediaStreamRef.current = stream;
      const source = inputAudioCtx.createMediaStreamSource(stream);
      // Small buffer = mic audio reaches the model in ~64ms batches instead of 256ms,
      // so end-of-speech is detected (and answering starts) noticeably sooner
      const processor = inputAudioCtx.createScriptProcessor(1024, 1, 1);

      // Local speech detector: if the browser heard the user speak and then go
      // quiet, hint the server so its watchdog can catch missed short answers
      let localSpokeAt = 0;
      let hintSent = true;
      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      // Analyser tap for the reactive sound-wave visualization
      const analyser = inputAudioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && isSetupCompleteRef.current) {
          const samples = e.inputBuffer.getChannelData(0);
          const base64 = pcmToBase64(samples);
          ws.send(JSON.stringify({ audio: base64 }));

          // Cheap RMS on the same buffer for the local speech detector
          let sum = 0;
          for (let i = 0; i < samples.length; i += 4) sum += samples[i] * samples[i];
          const rms = Math.sqrt(sum / (samples.length / 4));
          const now = performance.now();
          if (rms > 0.032) {
            localSpokeAt = now;
            hintSent = false;
          } else if (!hintSent && localSpokeAt > 0 && now - localSpokeAt > 850) {
            hintSent = true;
            ws.send(JSON.stringify({ userSpokeHint: true }));
          }
        }
      };

      // The socket may already be open by the time the mic permission resolves,
      // in which case onopen would never fire — send setup in both paths.
      let setupSent = false;
      const sendSetup = () => {
        if (setupSent || ws.readyState !== WebSocket.OPEN) return;
        setupSent = true;
        ws.send(JSON.stringify({ setup: true, text: initialTextContext || "", profile: profile || null, kickoff: !!kickoff }));
      };
      ws.onopen = sendSetup;
      sendSetup();

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.setupComplete) {
          isSetupCompleteRef.current = true;
          setIsConnecting(false);
          setIsListening(true);
          return;
        }
        if (msg.audio) {
          playAudioChunk(msg.audio);
        }
        if (msg.provisionalUserTranscript) {
          // Instant rough transcription — shown immediately, corrected later
          callbacksRef.current.onProvisionalUserTranscript?.(msg.provisionalUserTranscript);
        }
        if (msg.userTranscript) {
          // Authoritative server-side transcription of the user's turn
          callbacksRef.current.onUserTranscript?.(msg.userTranscript);
        }
        if (msg.userTranscriptEmpty) {
          callbacksRef.current.onUserTranscriptEmpty?.();
        }
        if (msg.outputTranscript) {
          callbacksRef.current.onAgentTranscript?.(msg.outputTranscript);
        }
        if (msg.toolCall) {
          handleToolCall(msg.toolCall);
        }
        if (msg.sessionError) {
          callbacksRef.current.onError?.("השיחה הקולית נותקה — בדוק את חיבור האינטרנט ונסה שוב.");
        }
        if (msg.turnComplete) {
          callbacksRef.current.onTurnComplete?.();
        }
        if (msg.interrupted) {
          // Student started talking over the mentor: stop scheduled playback immediately
          activeSourcesRef.current.forEach(s => { try { s.stop(); } catch (e) {} });
          activeSourcesRef.current = [];
          nextStartTimeRef.current = 0;
          setIsPlaying(false);
          // An interrupted turn is over — the mentor's next words start a new bubble
          callbacksRef.current.onTurnComplete?.();
        }
      };

      ws.onclose = () => {
        setIsListening(false);
        setIsPlaying(false);
        setIsConnecting(false);
        isSetupCompleteRef.current = false;
        wsRef.current = null;
      };

      ws.onerror = (e) => {
        console.error("Live WebSockets error", e);
        callbacksRef.current.onError?.("החיבור לשיחה הקולית נכשל. נסה שוב.");
      };

    } catch (e) {
      console.error("Microphone access denied or error:", e);
      callbacksRef.current.onError?.("אין גישה למיקרופון. אפשר גישה בהגדרות הדפדפן כדי לדבר עם המנטור.");
      setIsConnecting(false);
      setIsListening(false);
      ws.close();
      wsRef.current = null;
    }
  }, []);

  const readLevel = (analyser: AnalyserNode | null, smoothedRef: React.MutableRefObject<number>): number => {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.min(1, Math.sqrt(sum / data.length) * 3.5);
    smoothedRef.current = Math.max(rms, smoothedRef.current * 0.88);
    return smoothedRef.current;
  };

  // Smoothed 0..1 microphone level, safe to call every animation frame
  const getInputLevel = useCallback((): number => readLevel(analyserRef.current, smoothedLevelRef), []);

  // Smoothed 0..1 level of the mentor's speech output
  const getOutputLevel = useCallback((): number => readLevel(outputAnalyserRef.current, smoothedOutputLevelRef), []);

  const stopLiveSession = useCallback(() => {
    setIsListening(false);
    setIsPlaying(false);
    setIsConnecting(false);
    isSetupCompleteRef.current = false;
    analyserRef.current = null;
    smoothedLevelRef.current = 0;
    outputAnalyserRef.current = null;
    smoothedOutputLevelRef.current = 0;

    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch (e) {} });
    activeSourcesRef.current = [];

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => stopLiveSession, [stopLiveSession]);

  return {
    isPlaying,
    isListening,
    isConnecting,
    voiceURI,
    setVoiceURI,
    startLiveSession,
    stopLiveSession,
    getInputLevel,
    getOutputLevel
  };
}
