const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const returnStart = content.indexOf('  return (\n    <div className="h-screen bg-[#FDFCF8]');
const modalStart = content.indexOf('      {/* --- FLOATING MODAL FOR NEW BRIEF UPLOAD --- */}');

if (returnStart === -1 || modalStart === -1) {
  console.log('Could not find boundaries', returnStart, modalStart);
  process.exit(1);
}

const newReturn = `  return (
    <div className="h-[100dvh] bg-[#FDFCF8] text-[#1A1A1A] flex flex-col font-sans overflow-hidden relative transition-colors duration-200" dir="rtl">
      
      {/* Mobile-first Header */}
      <header className="flex items-center justify-between px-4 py-4 border-b border-[#1A1A1A] bg-white z-10 shrink-0">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 rounded-full hover:bg-neutral-100 active:bg-neutral-200 transition-colors">
          <Menu className="w-6 h-6 text-[#1A1A1A]" />
        </button>
        <div className="flex-1 flex justify-center text-center px-4 overflow-hidden">
          {activeProject ? (
            <div className="flex flex-col items-center">
              <h1 className="font-bold text-[#1A1A1A] truncate text-lg">
                {activeProject.brief.assignmentName}
              </h1>
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest">{activeProject.brief.courseName}</span>
            </div>
          ) : (
            <h1 className="font-display serif text-xl font-bold tracking-tight uppercase leading-none text-[#1A1A1A]">MentorAI</h1>
          )}
        </div>
        <button onClick={() => setIsNotesOpen(true)} className="p-2 -mr-2 rounded-full hover:bg-neutral-100 active:bg-neutral-200 transition-colors">
          <FileText className="w-6 h-6 text-[#1A1A1A]" />
        </button>
      </header>

      {/* Progress Bar / Roadmap Indicator */}
      {activeProject && (
        <div 
          className="bg-white border-b border-[#1A1A1A] py-3 px-4 flex items-center justify-center relative cursor-pointer hover:bg-neutral-50 transition-colors shrink-0 shadow-sm" 
          onClick={() => setIsRoadmapModalOpen(true)}
        >
          {(() => {
            const activeIdx = activeProject.checklist.findIndex(i => !i.completed);
            const currentIdx = activeIdx === -1 ? activeProject.checklist.length - 1 : activeIdx;
            
            const currentItem = activeProject.checklist[currentIdx];
            const prevItem = currentIdx > 0 ? activeProject.checklist[currentIdx - 1] : null;
            const nextItem = currentIdx < activeProject.checklist.length - 1 ? activeProject.checklist[currentIdx + 1] : null;

            return (
              <div className="flex items-center justify-between w-full max-w-md mx-auto overflow-hidden relative">
                <div className="flex-1 flex justify-start truncate opacity-40 translate-x-2">
                   {prevItem && <span className="text-xs truncate pr-1">{prevItem.title}</span>}
                </div>
                <div className="flex-none flex flex-col items-center justify-center px-4 z-10 w-[55%]">
                   <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider mb-0.5">תחנה נוכחית</span>
                   <span className="text-sm font-bold text-[#1A1A1A] truncate w-full text-center">{currentItem.title}</span>
                </div>
                <div className="flex-1 flex justify-end truncate opacity-40 -translate-x-2">
                   {nextItem && <span className="text-xs truncate pl-1">{nextItem.title}</span>}
                </div>
              </div>
            );
          })()}
          <div 
            className="absolute bottom-0 left-0 h-[3px] bg-emerald-500 transition-all duration-300" 
            style={{ width: \`\${Math.round((activeProject.checklist.filter(i => i.completed).length / activeProject.checklist.length) * 100)}%\` }} 
          />
        </div>
      )}

      {/* Main Center Area: Voice Agent */}
      <main className="flex-1 flex flex-col items-center justify-center relative bg-[#FDFCF8] overflow-hidden p-6">
        
        {/* Alerts positioned absolutely on top */}
        <div className="absolute top-4 left-4 right-4 z-20 space-y-2 pointer-events-none">
          {errorMessage && (
            <div className="bg-red-50 border border-red-500 text-red-900 px-4 py-3 rounded-sm flex items-start justify-between gap-3 text-sm shadow-md pointer-events-auto">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
                <span className="font-semibold">{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-red-700 hover:text-red-900 font-bold text-xs"><X className="w-4 h-4"/></button>
            </div>
          )}
          {successMessage && (
            <div className="bg-[#f0f9ff] border border-blue-400 text-blue-900 px-4 py-3 rounded-sm flex items-start justify-between gap-3 text-sm shadow-md pointer-events-auto">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[#0369a1]" />
                <span className="font-semibold">{successMessage}</span>
              </div>
              <button onClick={() => setSuccessMessage(null)} className="text-[#0369a1] hover:text-[#0c4a6e] font-bold text-xs"><X className="w-4 h-4"/></button>
            </div>
          )}
        </div>

        {/* Transcripts Display */}
        {activeProject && (
          <div className="absolute top-8 left-4 right-4 flex flex-col items-center gap-3 pointer-events-none z-10">
             {voiceAgent.transcripts.length > 0 ? (
               <>
                 <p className="text-xl md:text-2xl font-serif text-[#1A1A1A] text-center max-w-sm drop-shadow-sm font-medium leading-relaxed">
                   {voiceAgent.transcripts.filter(t => t.isAgent).pop()?.text}
                 </p>
                 <p className="text-sm font-sans text-neutral-500 italic text-center max-w-sm">
                   "{voiceAgent.transcripts.filter(t => !t.isAgent).pop()?.text}"
                 </p>
               </>
             ) : (
               <p className="text-neutral-500 text-sm text-center px-4">
                 {voiceAgent.isListening ? 'מקשיב... נהל איתי שיחה חופשית על המטלה.' : 'קראתי את המטלה. הקש על העיגול כדי להתחיל בשיחה.'}
               </p>
             )}
          </div>
        )}

        {!activeProject && projects.length === 0 && (
          <div className="absolute top-1/4 text-center px-6">
            <h2 className="text-2xl font-bold text-[#1A1A1A] mb-3">ברוך הבא ל-MentorAI</h2>
            <p className="text-neutral-500 text-base">לחץ על כפתור ה- <strong>+</strong> למטה כדי להתחיל ולהעלות מטלה אקדמית.</p>
          </div>
        )}

        <div className="relative z-10 mt-16 flex items-center justify-center">
           {voiceAgent.isPlaying && (
             <div className="absolute inset-[-4rem] bg-[#1A1A1A]/5 rounded-full blur-xl animate-ping opacity-60"></div>
           )}
           <button
             onClick={() => {
               if (voiceAgent.isListening) {
                 voiceAgent.stopLiveSession();
               } else if (activeProject) {
                 handleVoiceInteraction();
               }
             }}
             disabled={!activeProject}
             className={\`relative z-10 w-56 h-56 md:w-64 md:h-64 bg-[#1A1A1A] rounded-full shadow-2xl flex items-center justify-center border-4 border-white transition-all group \${!activeProject ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}\`}
           >
             {voiceAgent.isPlaying ? (
               <div className="flex gap-2.5 justify-center items-center h-20 w-full px-10 group-hover:hidden">
                 <span className="w-2.5 bg-white rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-1/2"></span>
                 <span className="w-2.5 bg-white rounded-full animate-[pulse_1s_ease-in-out_infinite_0.1s] h-full"></span>
                 <span className="w-2.5 bg-white rounded-full animate-[pulse_0.9s_ease-in-out_infinite_0.2s] h-2/3"></span>
                 <span className="w-2.5 bg-white rounded-full animate-[pulse_1.2s_ease-in-out_infinite_0.3s] h-4/5"></span>
                 <span className="w-2.5 bg-white rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.4s] h-1/2"></span>
               </div>
             ) : voiceAgent.isListening ? (
               <div className="absolute inset-0 flex items-center justify-center text-white">
                 <div className="absolute inset-2 rounded-full border-t-4 border-white animate-spin opacity-20"></div>
                 <Mic className="w-20 h-20 group-hover:hidden" />
               </div>
             ) : (
               <Play className="w-24 h-24 text-white ml-3 opacity-90" />
             )}

             {voiceAgent.isListening && (
               <Square className="w-16 h-16 text-white hidden group-hover:block absolute" fill="currentColor" />
             )}
           </button>
        </div>
      </main>

      {/* FAB: Floating Action Button */}
      <button 
        onClick={() => setIsUploadModalOpen(true)}
        className="absolute bottom-8 right-6 w-16 h-16 bg-[#1A1A1A] text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-20"
      >
        <Plus className="w-8 h-8" />
      </button>

      {/* Sidebar Drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-[#1A1A1A]/40 backdrop-blur-sm z-50 transition-opacity flex justify-end" onClick={() => setIsSidebarOpen(false)}>
          <div className="w-[85%] max-w-sm h-full bg-[#FAF8F5] shadow-2xl flex flex-col animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
             <div className="p-5 border-b border-[#1A1A1A] flex justify-between items-center bg-white shrink-0">
                <h2 className="font-bold text-xl text-[#1A1A1A] font-serif">השיחות שלי</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 -mr-2 rounded-full hover:bg-neutral-100"><X className="w-6 h-6" /></button>
             </div>
             
             {/* Voice Settings in Drawer */}
             <div className="p-4 border-b border-neutral-200 bg-white space-y-3">
               <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-widest">קול המנטור</h3>
               <div className="flex gap-2 items-center">
                  <select 
                    className="flex-1 border border-stone-300 rounded-sm p-3 text-sm focus:ring-1 focus:ring-[#1A1A1A] outline-none bg-white font-bold"
                    value={voiceAgent.voiceURI}
                    onChange={(e) => voiceAgent.setVoiceURI(e.target.value)}
                  >
                    <option value="Zephyr">זפיר</option>
                    <option value="Aoede">אואדה</option>
                    <option value="Charon">כארון</option>
                    <option value="Fenrir">פנריר</option>
                    <option value="Kore">קורה</option>
                    <option value="Puck">פאק</option>
                  </select>
               </div>
             </div>

             <div className="flex-1 overflow-y-auto p-4 space-y-4">
               {projects.length === 0 ? (
                 <p className="text-sm text-neutral-500 text-center mt-10">אין שיחות פעילות</p>
               ) : (
                 Object.entries(groupedProjects).map(([course, courseProjects]) => (
                  <div key={course} className="space-y-1 bg-white border border-[#1A1A1A] rounded-sm overflow-hidden shadow-sm">
                     <div className="w-full text-right p-3 bg-[#F5F2ED] font-bold text-sm flex items-center gap-2 border-b border-[#1A1A1A]">
                       <FolderOpen className="w-4 h-4 text-[#1A1A1A]" /> {course}
                     </div>
                     <div className="divide-y divide-neutral-100">
                        {courseProjects.map(p => (
                          <div 
                            key={p.id} 
                            className={\`w-full text-right p-4 hover:bg-neutral-50 transition-colors flex flex-col justify-center group cursor-pointer \${p.id === activeProjectId ? 'bg-emerald-50/50' : ''}\`} 
                            onClick={() => { setActiveProjectId(p.id); setIsSidebarOpen(false); }}
                          >
                            <span className="text-sm font-bold text-[#1A1A1A] truncate">{p.brief.assignmentName}</span>
                            <span className="text-[10px] text-neutral-500 mt-1">עודכן לאחרונה: {p.lastActive}</span>
                          </div>
                        ))}
                     </div>
                  </div>
                 ))
               )}
             </div>
          </div>
        </div>
      )}

      {/* Roadmap Modal */}
      {isRoadmapModalOpen && activeProject && (
        <div className="fixed inset-0 bg-[#FDFCF8] z-50 flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="p-5 border-b border-[#1A1A1A] flex justify-between items-center bg-white shrink-0 shadow-sm">
            <h2 className="font-bold text-xl text-[#1A1A1A] font-serif">מפת דרכים</h2>
            <button onClick={() => setIsRoadmapModalOpen(false)} className="p-2 -ml-2 rounded-full hover:bg-neutral-100"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
             <div className="space-y-4 pb-8">
               {activeProject.checklist.map((item, i) => (
                  <div key={item.id} className="border border-[#1A1A1A] bg-white p-4 rounded-sm flex items-start gap-4 shadow-[2px_2px_0px_rgba(26,26,26,1)] relative transition-all">
                     <button 
                       onClick={() => toggleTodo(activeProject.id, item.id)} 
                       className={\`w-7 h-7 rounded-sm border-2 mt-0.5 flex items-center justify-center shrink-0 transition-colors \${item.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[#1A1A1A] bg-white'}\`}
                     >
                       {item.completed && <Check className="w-5 h-5" />}
                     </button>
                     <div className="flex-1 pt-0.5">
                       <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1 block">שלב {i + 1} • {item.phase}</span>
                       <p className={\`font-bold text-base leading-tight mb-1 \${item.completed ? 'line-through text-neutral-400' : 'text-[#1A1A1A]'}\`}>{item.title}</p>
                       <p className="text-sm text-neutral-600 leading-relaxed">{item.description}</p>
                     </div>
                     <button onClick={() => deleteTodo(activeProject.id, item.id)} className="p-2 mt-0.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-sm transition-colors shrink-0">
                       <Trash2 className="w-5 h-5" />
                     </button>
                  </div>
               ))}
             </div>
             <div className="mt-4 border-t-2 border-dashed border-neutral-300 pt-6 pb-20">
               <h3 className="font-bold text-base mb-4 text-[#1A1A1A] flex items-center gap-2"><Plus className="w-5 h-5"/> הוסף תחנה אישית</h3>
               <form onSubmit={handleAddCustomTodo} className="flex flex-col sm:flex-row gap-3">
                  <input 
                    type="text" 
                    value={newTodoTitle} 
                    onChange={e => setNewTodoTitle(e.target.value)} 
                    placeholder="שם התחנה החדשה..." 
                    className="flex-1 border-2 border-stone-300 rounded-sm p-3 text-base focus:border-[#1A1A1A] outline-none transition-colors" 
                  />
                  <button type="submit" className="bg-[#1A1A1A] text-white px-6 py-3 rounded-sm font-bold text-base shadow-md active:translate-y-px transition-all">
                    הוסף למפה
                  </button>
               </form>
             </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {isNotesOpen && activeProject && (
        <div className="fixed inset-0 bg-[#FDFCF8] z-50 flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="p-5 border-b border-[#1A1A1A] flex justify-between items-center bg-white shrink-0 shadow-sm">
            <h2 className="font-bold text-xl text-[#1A1A1A] font-serif">פתקים ורעיונות</h2>
            <button onClick={() => setIsNotesOpen(false)} className="p-2 -ml-2 rounded-full hover:bg-neutral-100"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 flex flex-col p-5 sm:p-6 bg-[#FAF8F5]">
            <textarea
              className="flex-1 w-full p-5 border-2 border-[#1A1A1A] rounded-sm resize-none focus:outline-none focus:ring-4 focus:ring-emerald-500/20 bg-white text-base leading-relaxed font-sans shadow-inner transition-shadow"
              value={scratchpad}
              onChange={(e) => setScratchpad(e.target.value)}
              placeholder="כאן תוכלו לרשום לעצמכם רעיונות, נקודות חשובות, וטיוטות להגשה..."
            />
            <div className="pt-6 shrink-0 pb-8">
              <button onClick={() => {
                const updated = projects.map(p => {
                  if (p.id === activeProjectId) {
                    return { ...p, notes: scratchpad };
                  }
                  return p;
                });
                saveProjects(updated);
                setIsNotesOpen(false);
                setSuccessMessage("הפתקים נשמרו בהצלחה!");
              }} className="w-full bg-[#1A1A1A] text-white py-4 font-bold text-lg rounded-sm shadow-xl active:translate-y-px active:shadow-sm transition-all flex items-center justify-center gap-2">
                <Check className="w-6 h-6" /> שמור וסגור
              </button>
            </div>
          </div>
        </div>
      )}

`;

const finalContent = content.substring(0, returnStart) + newReturn + content.substring(modalStart);
fs.writeFileSync('src/App.tsx', finalContent);
console.log('Successfully updated App.tsx return block');
