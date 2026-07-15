import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Image as ImageIcon, ArrowRight, Trash2, Bot } from 'lucide-react';
import { Project, Note } from '../types';
import { IconPlus } from './icons';

interface NotesDrawerProps {
  open: boolean;
  onClose: () => void;
  project?: Project;
  onAddNote: (note: Note) => void;
  onUpdateNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
}

function NoteEditor({ note, onUpdate, onDone }: { note: Note; onUpdate: (n: Note) => void; onDone: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (field: keyof Note, value: string) => {
    onUpdate({ ...note, [field]: value, updatedAt: new Date().toISOString() });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onUpdate({
            ...note,
            imageUrl: event.target.result as string,
            imageName: file.name,
            updatedAt: new Date().toISOString()
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      <div className="flex justify-between items-start mb-4 gap-3">
        <input
          type="text"
          value={note.title}
          onChange={(e) => handleChange('title', e.target.value)}
          onFocus={() => { if (note.title === 'פתק חדש') handleChange('title', ''); }}
          placeholder="כותרת הפתק..."
          className="flex-1 text-xl font-bold bg-transparent border-none outline-none text-ink placeholder-ink/35 min-w-0"
        />
        <button
          onClick={onDone}
          className="rounded-full bg-ink text-canvas p-2.5 active:scale-95 transition-transform shrink-0"
          title="סיום"
        >
          <Check className="w-5 h-5" />
        </button>
      </div>

      {note.imageUrl ? (
        <div className="mb-4 rounded-2xl border border-ink/20 p-2 bg-paper/60 relative">
          <img src={note.imageUrl} alt={note.imageName} className="max-h-56 w-auto mx-auto object-contain rounded-lg" />
          <button
            onClick={() => onUpdate({ ...note, imageUrl: undefined, imageName: undefined, updatedAt: new Date().toISOString() })}
            className="absolute top-3 left-3 rounded-full glass-strong text-bauhaus-red p-2 border border-ink/20"
            title="הסר תמונה"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={note.imageName || ''}
            onChange={(e) => handleChange('imageName', e.target.value)}
            placeholder="שם התמונה (אופציונלי)"
            className="mt-2 text-sm font-medium text-center text-ink/60 bg-transparent outline-none w-full border-b border-dashed border-ink/25 focus:border-ink"
          />
        </div>
      ) : (
        <div className="mb-4">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-sm font-bold text-ink rounded-full px-4 py-2 border border-ink/25 hover:border-ink hover:bg-ink/5 transition-colors"
          >
            <ImageIcon className="w-4 h-4" /> הוסף תמונה כרפרנס
          </button>
        </div>
      )}

      <textarea
        value={note.content}
        onChange={(e) => handleChange('content', e.target.value)}
        placeholder="תוכן הפתק..."
        className="flex-1 w-full bg-transparent border-none outline-none resize-none text-base leading-relaxed text-ink/90 placeholder-ink/35 min-h-40"
      />
    </div>
  );
}

function DrawerContent({ project, onAddNote, onUpdateNote, onDeleteNote, onClose, showClose }: Omit<NotesDrawerProps, 'open'> & { showClose: boolean }) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const notesList = project?.notesList || [];
  const editingNote = notesList.find(n => n.id === editingNoteId);

  const handleAddNote = () => {
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: 'פתק חדש',
      content: '',
      createdBy: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    onAddNote(newNote);
    setEditingNoteId(newNote.id);
  };

  return (
    <div className="relative flex flex-col h-full" dir="rtl">
      <div className="px-4 py-3.5 border-b border-ink/15 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          {editingNote && (
            <button onClick={() => setEditingNoteId(null)} className="p-1.5 rounded-full hover:bg-ink/5 transition-colors" aria-label="חזרה">
              <ArrowRight className="w-5 h-5 text-ink/60" />
            </button>
          )}
          <h2
            onClick={onClose}
            role="button"
            aria-label="סגור"
            className="font-bold text-lg text-ink flex items-center gap-2 cursor-pointer"
          >
            <span className="w-3 h-3 bg-bauhaus-blue inline-block" aria-hidden />
            {editingNote ? 'עריכת פתק' : 'פתקים ורעיונות'}
          </h2>
        </div>
      </div>

      {!project ? (
        <p className="text-sm text-ink/50 text-center mt-10 px-4">בחר שיחה כדי לראות את הפתקים שלה.</p>
      ) : editingNote ? (
        <NoteEditor note={editingNote} onUpdate={onUpdateNote} onDone={() => setEditingNoteId(null)} />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 pb-24">
            <h3 className="font-bold text-sm text-ink/60 mb-4">כל הפתקים ({notesList.length})</h3>

            {notesList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl border border-dashed border-ink/30 bg-paper/40">
                <span className="flex items-center gap-1.5 mb-3 opacity-70" aria-hidden>
                  <span className="w-3 h-3 rounded-full bg-bauhaus-red" />
                  <span className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[11px] border-l-transparent border-r-transparent border-b-bauhaus-blue" />
                  <span className="w-3 h-3 bg-bauhaus-yellow" />
                </span>
                <p className="text-ink/55 text-sm font-medium leading-relaxed">
                  עדיין אין כאן פתקים.
                  <br />
                  אפשר לבקש מהמנטור לשמור רעיונות מהשיחה, או ליצור פתק בכפתור למטה.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {notesList.map(note => (
                  <div
                    key={note.id}
                    onClick={() => setEditingNoteId(note.id)}
                    className="bg-paper/70 rounded-2xl border border-ink/15 p-3.5 cursor-pointer hover:border-ink/40 hover:shadow-md transition-all group"
                  >
                    <div className="flex justify-between items-start mb-1.5 gap-2">
                      <h4 className="font-bold text-sm text-ink truncate">{note.title || 'ללא כותרת'}</h4>
                      <div className="flex items-center gap-1 shrink-0">
                        {note.createdBy === 'ai' && (
                          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide bg-bauhaus-blue text-white px-1.5 py-0.5 rounded-full">
                            <Bot className="w-3 h-3" />
                            המנטור
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); }}
                          className="text-ink/25 hover:text-bauhaus-red transition-colors p-0.5"
                          aria-label="מחק פתק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {note.imageUrl && (
                      <div className="mb-2 overflow-hidden rounded-xl border border-ink/15 max-h-32">
                        <img src={note.imageUrl} alt={note.imageName || 'תמונה'} className="w-full h-full object-cover" />
                      </div>
                    )}
                    {note.content && <p className="text-ink/65 text-xs line-clamp-3 whitespace-pre-wrap">{note.content}</p>}
                    <div className="text-[10px] text-ink/35 mt-2 font-medium">
                      {new Date(note.updatedAt).toLocaleDateString('he-IL')}{' '}
                      {new Date(note.updatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add-note action: lives only inside the drawer, anchored 40% up from the bottom */}
          <button
            onClick={handleAddNote}
            style={{ bottom: '40%' }}
            className="absolute left-1/2 -translate-x-1/2 z-10 rounded-full bg-bauhaus-blue text-white font-bold text-sm pl-5 pr-4 py-3 flex items-center gap-2 shadow-lg shadow-ink/20 active:scale-95 transition-transform"
            aria-label="פתק חדש"
          >
            <IconPlus className="w-4 h-4" />
            פתק חדש
          </button>
        </>
      )}
    </div>
  );
}

export function NotesDrawer(props: NotesDrawerProps) {
  const { open, onClose } = props;
  // Ignore backdrop clicks right after opening (double-tap / synthetic trailing clicks)
  const openedAtRef = React.useRef(0);
  React.useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);
  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < 400) return;
    onClose();
  };
  return (
    <>
      {/* Docked panel on large screens */}
      <aside className="hidden lg:flex w-80 shrink-0 border-r border-ink/15 h-full glass-strong">
        <div className="w-full"><DrawerContent {...props} showClose={false} /></div>
      </aside>

      {/* Overlay drawer on mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="lg:hidden fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            onClick={handleBackdropClick}
          >
            <motion.div
              layoutId="notes-morph"
              className="absolute top-2 bottom-2 left-2 w-[86%] max-w-sm glass-strong border border-ink/20 overflow-hidden shadow-xl shadow-ink/20"
              style={{ borderRadius: 26 }}
              exit={{ opacity: 0, transition: { duration: 0.32 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.7, right: 0 }}
              onDragEnd={(_e, info) => {
                // Swipe left closes the left drawer
                if (info.offset.x < -90 || info.velocity.x < -500) onClose();
              }}
              onClick={e => e.stopPropagation()}
            >
              <motion.div
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.18 }}
              >
                <DrawerContent {...props} showClose={true} />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
