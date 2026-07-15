import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, ChevronLeft } from 'lucide-react';
import { ParsedBrief } from '../types';
import { SAMPLE_PROJECTS } from '../data/samples';

interface UploadModalProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  onLoadSample: (sample: ParsedBrief) => void;
  onError: (message: string) => void;
}

export function UploadModal({ open, loading, onClose, onUpload, onLoadSample, onError }: UploadModalProps) {
  const [dragActive, setDragActive] = useState(false);

  // Ignore backdrop clicks right after opening (double-tap / synthetic trailing clicks)
  const openedAtRef = React.useRef(0);
  React.useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);
  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < 400) return;
    onClose();
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      onUpload(file);
    } else {
      onError('סוג הקובץ אינו נתמך. אנא העלה קובץ PDF בלבד.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-ink/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
          dir="rtl"
        >
          <motion.div
            className="glass-strong border border-ink/20 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90dvh] flex flex-col overflow-hidden relative"
            initial={{ y: 80, opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-ink/15 flex justify-between items-center shrink-0">
              <h3
                onClick={onClose}
                role="button"
                aria-label="סגור"
                className="text-base font-bold text-ink flex items-center gap-2 cursor-pointer"
              >
                <span className="w-3 h-3 bg-bauhaus-yellow inline-block rotate-45" aria-hidden />
                מטלה חדשה
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-safe">
              {/* Upload box */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all ${
                  dragActive
                    ? 'border-bauhaus-red bg-bauhaus-red/5 scale-[1.02]'
                    : 'border-ink/30 bg-paper/50 hover:border-ink'
                }`}
              >
                {loading ? (
                  <div className="space-y-4 flex flex-col items-center py-4">
                    <div className="flex items-center gap-2" aria-hidden>
                      <span className="w-4 h-4 rounded-full bg-bauhaus-red animate-bounce" />
                      <span className="w-4 h-4 bg-bauhaus-blue animate-bounce [animation-delay:120ms]" />
                      <span className="w-0 h-0 border-l-8 border-r-8 border-b-[14px] border-l-transparent border-r-transparent border-b-bauhaus-yellow animate-bounce [animation-delay:240ms]" />
                    </div>
                    <p className="font-bold text-sm text-ink">קורא את הבריף ובונה מפת דרכים…</p>
                    <p className="text-xs text-ink/50">עוד כמה שניות…</p>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center cursor-pointer w-full gap-3 py-2">
                    <div className="bg-canvas p-3 border-2 border-ink">
                      <Upload className="w-6 h-6 text-ink" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-ink">העלה קובץ PDF של הבריף</h4>
                      <p className="text-xs text-ink/50 mt-1">גרור לכאן או לחץ לבחירה</p>
                    </div>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUpload(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Samples */}
              <div className="space-y-3 pb-4">
                <p className="text-xs font-bold text-ink/40 uppercase tracking-wider">דוגמאות לניסיון מהיר</p>
                <div className="flex flex-col gap-2.5">
                  {SAMPLE_PROJECTS.map((sample, index) => (
                    <button
                      key={index}
                      onClick={() => onLoadSample(sample)}
                      disabled={loading}
                      className="text-right p-3.5 bg-paper/60 rounded-2xl border border-ink/20 hover:border-ink hover:bg-bauhaus-yellow/40 transition-all flex justify-between items-center group active:scale-[0.98] disabled:opacity-40"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-ink truncate">{sample.assignmentName}</p>
                        <p className="text-xs text-ink/50 mt-0.5 truncate">{sample.courseName}</p>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-ink/30 group-hover:text-ink group-hover:-translate-x-1 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
