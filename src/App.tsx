/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Brain, 
  Video, 
  Users, 
  FileText, 
  Zap, 
  Trash2, 
  Plus, 
  Copy, 
  ExternalLink,
  ChevronRight,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal
} from 'lucide-react';
import { Character, AppStep } from './types';
import { aiService } from './services/aiService';

export default function App() {
  const [step, setStep] = useState<AppStep>('upload');
  const [activeTab, setActiveTab] = useState<'characters' | 'script'>('characters');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [frames, setFrames] = useState<string[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scriptText, setScriptText] = useState<string>('');
  const [pageCount, setPageCount] = useState(0);
  const [estimatedPages, setEstimatedPages] = useState(0);
  const [logs, setLogs] = useState<{ time: string, message: string, type: 'info' | 'error' | 'success' }[]>([]);
  const [duration, setDuration] = useState<number>(1);
  const [idea, setIdea] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [showKB, setShowKB] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const checkCompliance = async () => {
      setIsLearning(true);
      const data = await aiService.getComplianceRules();
      setComplianceData(data);
      setTimeout(() => setIsLearning(false), 2000); // UI feedback for "learning"
    };
    checkCompliance();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setStep('upload');
    setFrames([]);
    setCharacters([]);
    setScriptText('');
    setActiveTab('characters');
  };

  const extractFrames = async () => {
    if (!videoRef.current || !canvasRef.current) return [];
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const numFrames = 3;
    const capturedFrames: string[] = [];
    const dur = video.duration || 5;
    for (let i = 1; i <= numFrames; i++) {
      const time = (dur / (numFrames + 1)) * i;
      video.currentTime = time;
      await new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const offscreen = document.createElement('canvas');
          const maxWidth = 512;
          const scale = Math.min(maxWidth / canvas.width, 1);
          offscreen.width = canvas.width * scale;
          offscreen.height = canvas.height * scale;
          offscreen.getContext('2d')?.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
          capturedFrames.push(offscreen.toDataURL('image/jpeg', 0.6));
          resolve(true);
        };
        video.addEventListener('seeked', onSeeked);
      });
    }
    return capturedFrames;
  };

  const handleDetectCharacters = async () => {
    setIsProcessing(true);
    setStep('detecting');
    try {
      const capturedFrames = await extractFrames();
      setFrames(capturedFrames);
      const detected = await aiService.detectCharacters(capturedFrames);
      setCharacters(detected);
      setStep('edit');
    } catch (err: any) {
      setToast({ msg: err.message || 'Lỗi nhận diện nhân vật', type: 'error' });
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, message, type }, ...prev].slice(0, 50));
  };

  const clearLogs = () => setLogs([]);

  const handleGenerateScript = async () => {
    setIsProcessing(true);
    setStep('generating');
    setPageCount(1);
    setEstimatedPages(Math.ceil(duration * 3.5));
    setScriptText('');
    addLog(`Bắt đầu tạo kịch bản mới cho video ${duration} phút...`, 'info');
    
    try {
      let fullScript = await aiService.generateScript(frames, characters, duration, idea);
      setScriptText(fullScript);
      addLog(`Đã hoàn thành trang 1.`, 'success');
      
      setStep('edit');
      setActiveTab('script');
      
      // Auto-continue logic
      let currentScript = fullScript;
      let pCount = 1;
      const MAX_PAGES = 15;
      
      while (currentScript.includes('[CONTINUE_REQUIRED]') && pCount < MAX_PAGES) {
        addLog(`Phát hiện kịch bản chưa hết. Tự động viết tiếp trang ${pCount + 1}...`, 'info');
        setToast({ msg: `Đã xong trang ${pCount}. Đang mở rộng trang ${pCount + 1}...`, type: 'success' });
        setIsProcessing(true); 
        
        try {
          const moreScript = await aiService.continueScript(currentScript, frames, characters, duration, idea);
          currentScript = moreScript;
          
          setScriptText(prev => {
            const cleanedPrev = prev.replace('[CONTINUE_REQUIRED]', '').trim();
            return cleanedPrev + "\n\n--- TRANG " + (pCount + 1) + " ---\n\n" + moreScript;
          });
          
          pCount++;
          setPageCount(pCount);
          addLog(`Đã hoàn thành trang ${pCount}.`, 'success');
        } catch (innerErr) {
          addLog(`Lỗi khi tự động bóc tách trang ${pCount + 1}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`, 'error');
          console.error("Auto-continue failed", innerErr);
          break;
        }
      }
      
      addLog('Toàn bộ quy trình bóc tách kịch bản đã hoàn tất.', 'success');
      setToast({ msg: 'Kịch bản đã được bóc tách hoàn chỉnh!', type: 'success' });
    } catch (err: any) {
      const errorMsg = err.message || 'Lỗi tạo kịch bản';
      addLog(`Lỗi hệ thống: ${errorMsg}`, 'error');
      setToast({ msg: errorMsg, type: 'error' });
      setStep('edit');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleContinueScript = async () => {
    if (!scriptText) return;
    setIsProcessing(true);
    addLog(`Người dùng yêu cầu mở rộng kịch bản thủ công (Trang ${pageCount + 1})...`, 'info');
    try {
      const moreScript = await aiService.continueScript(scriptText, frames, characters, duration, idea);
      setScriptText(prev => {
        const cleanedPrev = prev.replace('[CONTINUE_REQUIRED]', '').replace('[END_OF_SCRIPT]', '').trim();
        return cleanedPrev + "\n\n--- TIẾP THEO (TRANG MỚI) ---\n\n" + moreScript;
      });
      setPageCount(prev => prev + 1);
      addLog(`Đã thêm thành công một trang mới.`, 'success');
      setToast({ msg: 'Đã thêm trang mới cho kịch bản!', type: 'success' });
    } catch (err: any) {
      const errorMsg = err.message || 'Lỗi mở rộng kịch bản';
      addLog(`Lỗi mở rộng: ${errorMsg}`, 'error');
      setToast({ msg: errorMsg, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const addCharacter = () => {
    setCharacters([...characters, {
      id: `char-${Date.now()}`,
      name: 'Nhân vật mới',
      role: 'Vai trò',
      description: 'Mô tả ngoại hình',
      physicality: '',
      closeup_notes: '',
      voice: 'Giọng đọc truyền cảm'
    }]);
  };

  const updateCharacter = (id: string, field: keyof Character, value: string) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCharacter = (id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToast({ msg: 'Đã sao chép vào bộ nhớ tạm!', type: 'success' });
  };

  return (
    <div className="flex h-screen bg-bg text-tx overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <nav className="w-64 border-r border-slate-800 flex flex-col bg-s1">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center shadow-lg shadow-brand/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-white">ViralQuest</span>
          </div>
        </div>
        
        <div className="flex-1 py-4 px-3 space-y-1">
          <div className="text-[10px] font-semibold text-slate-500 uppercase px-3 pb-2 tracking-widest">Quy trình</div>
          
          <button 
            onClick={() => {}}
            className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${step === 'upload' ? 'bg-slate-800 border border-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800/30'}`}
          >
            <div className={`w-2 h-2 rounded-full ${videoUrl ? 'bg-gr' : 'bg-slate-600'}`}></div>
            <span className="text-xs font-medium">1. Tải lên video</span>
          </button>

          <button 
            className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${step === 'edit' && activeTab === 'characters' ? 'bg-slate-800 border border-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800/30'}`}
          >
            <div className={`w-2 h-2 rounded-full ${characters.length > 0 ? 'bg-gr' : 'bg-slate-600'}`}></div>
            <span className="text-xs font-medium">2. Nhân vật</span>
          </button>

          <button 
            className={`w-full p-3 rounded-xl flex items-center gap-3 transition-colors ${step === 'edit' && activeTab === 'script' ? 'bg-slate-800 border border-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800/30'}`}
          >
            <div className={`w-2 h-2 rounded-full ${scriptText ? 'bg-gr' : 'bg-slate-600'}`}></div>
            <span className="text-xs font-medium">3. Kịch bản</span>
          </button>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-900/50 border border-indigo-400/30 flex items-center justify-center">
              <span className="text-xs font-bold text-indigo-300">VQ</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-white">AI Studio User</span>
              <span className="text-[9px] text-indigo-400 uppercase tracking-tighter">Pro Access</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-bg">
        <header className="h-16 border-b border-slate-800 bg-bg/80 backdrop-blur-sm flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isLearning ? 'bg-indigo-400 animate-pulse' : 'bg-gr shadow-[0_0_8px_rgba(34,197,94,0.6)]'}`}></div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                {isLearning ? 'AI Learning Compliance...' : 'System Ready'}
              </span>
            </div>
            <div className="h-4 w-[1px] bg-slate-700"></div>
            <span className="text-xs font-semibold text-slate-400">Model: <span className="text-brand">Gemini 3 Flash</span></span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowKB(true)} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2">
              <Brain className="w-3 h-3" /> Trí thức
            </button>
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-5xl mx-auto space-y-8">
            <AnimatePresence mode="wait">
              {step === 'upload' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8"
                >
                  <div className="text-center space-y-4">
                    <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tighter text-white">Giải Mã Phép Màu Viral</h1>
                    <p className="text-slate-400 max-w-lg mx-auto text-sm leading-relaxed">
                      Phân tích video nguồn, nhận diện kiến trúc nhân vật và xuất kịch bản triệu view chuẩn điện ảnh.
                    </p>
                  </div>

                  <div className={`relative aspect-video rounded-3xl overflow-hidden group border-2 border-slate-800 transition-all duration-300 ${!videoUrl ? 'border-dashed bg-slate-900 border-slate-700 cursor-pointer hover:border-brand/40 hover:bg-brand/5' : ''}`}>
                    {!videoUrl ? (
                      <label className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer">
                        <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center text-3xl group-hover:bg-brand/20 transition-all">
                          <Upload className="w-8 h-8 text-slate-400" />
                        </div>
                        <div className="text-center">
                          <div className="text-white font-semibold">Tải lên video nguồn</div>
                          <div className="font-mono text-[9px] tracking-widest uppercase text-slate-500 mt-1">MP4, MOV, WEBM</div>
                        </div>
                        <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                      </label>
                    ) : (
                      <>
                        <video ref={videoRef} src={videoUrl} controls className="w-full h-full object-cover" />
                        <button onClick={() => { setVideoUrl(''); setVideoFile(null); }} className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:text-re transition-colors">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                  
                  {videoUrl && (
                    <motion.button 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={handleDetectCharacters}
                      className="btn-primary w-full max-w-md mx-auto block"
                    >
                      BẮT ĐẦU PHÂN TÍCH NHÂN VẬT
                    </motion.button>
                  )}
                </motion.div>
              )}

              {step === 'detecting' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 gap-8">
                  <div className="w-24 h-24 rounded-full border-2 border-slate-800 border-t-brand animate-spin flex items-center justify-center relative">
                    <Brain className="w-10 h-10 text-brand animate-pulse" />
                  </div>
                  <div className="text-center">
                    <h2 className="font-display text-2xl font-bold text-white mb-2">Đang quét mã gen nhân vật...</h2>
                    <p className="text-slate-500 text-sm">Hệ thống đang trích xuất data từ các khung hình quan trọng.</p>
                  </div>
                </motion.div>
              )}

              {(step === 'edit' || step === 'generating') && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="gap-8 flex flex-col lg:flex-row">
                  {/* Left: Preview Frames */}
                  <div className="lg:w-1/3 flex flex-col gap-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Khung hình gốc</div>
                    <div className="grid grid-cols-1 gap-3">
                      {frames.map((f, i) => (
                        <div key={i} className="aspect-video rounded-xl overflow-hidden border border-slate-800">
                          <img src={f} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Active Tab Data */}
                  <div className="lg:w-2/3 space-y-6">
                    <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                      <button onClick={() => setActiveTab('characters')} className={`flex-1 py-2 rounded-lg font-mono text-[9px] uppercase tracking-widest transition-all ${activeTab === 'characters' ? 'bg-slate-800 text-brand shadow-sm' : 'text-slate-500'}`}>Nhân vật</button>
                      <button onClick={() => setActiveTab('script')} className={`flex-1 py-2 rounded-lg font-mono text-[9px] uppercase tracking-widest transition-all ${activeTab === 'script' ? 'bg-slate-800 text-brand shadow-sm' : 'text-slate-500'}`}>Kịch bản</button>
                    </div>

                    {activeTab === 'characters' ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-display text-lg font-bold">Quản lý nhân vật</h3>
                          <button onClick={addCharacter} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors text-slate-400">
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="space-y-3">
                          {characters.map(c => (
                            <div key={c.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4 relative group">
                              <button onClick={() => removeCharacter(c.id)} className="absolute top-4 right-4 text-slate-600 hover:text-re transition-colors opacity-0 group-hover:opacity-100">
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="flex gap-4">
                                <input value={c.name} onChange={e => updateCharacter(c.id, 'name', e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm flex-1 text-white placeholder:text-slate-600 font-semibold" placeholder="Tên" />
                                <input value={c.role} onChange={e => updateCharacter(c.id, 'role', e.target.value)} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-sm flex-1 text-slate-400" placeholder="Vai trò" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1 block">Ngoại hình</label>
                                  <textarea value={c.description} onChange={e => updateCharacter(c.id, 'description', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 h-20 resize-none" />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1 block">Giọng nói</label>
                                  <textarea value={c.voice} onChange={e => updateCharacter(c.id, 'voice', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 h-20 resize-none" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={handleGenerateScript}
                          disabled={characters.length === 0}
                          className="btn-primary w-full"
                        >
                          {isProcessing ? 'ĐANG XỬ LÝ...' : 'XUẤT KỊCH BẢN SHOOTING'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {step === 'generating' ? (
                            <div className="space-y-8 w-full max-w-2xl">
                              <div className="flex flex-col items-center justify-center py-10 gap-4">
                                <div className="relative">
                                  <Loader2 className="w-12 h-12 text-brand animate-spin" />
                                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-brand">
                                    {pageCount}
                                  </div>
                                </div>
                                <div className="text-center space-y-1">
                                  <p className="text-white font-display text-lg font-bold tracking-tight">
                                    Đang kiến tạo kịch bản chuyên nghiệp
                                  </p>
                                  <p className="text-slate-500 font-mono text-[10px] uppercase tracking-widest">
                                    Tiến độ: <span className="text-brand">Trang {pageCount}</span> / Dự kiến <span className="text-indigo-400">{estimatedPages} trang</span>
                                  </p>
                                </div>
                              </div>
                              
                              {/* Integrated Status Logs during generation */}
                              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center gap-2 text-slate-500 mb-2">
                                  <Terminal className="w-3 h-3" />
                                  <span className="text-[9px] font-bold uppercase tracking-widest">Nhật ký tiến trình</span>
                                </div>
                                <div className="font-mono text-[10px] h-32 overflow-y-auto space-y-1 custom-scrollbar">
                                  {logs.map((log, i) => (
                                    <div key={i} className="flex gap-2">
                                      <span className="text-slate-600">[{log.time}]</span>
                                      <span className={log.type === 'error' ? 'text-re' : log.type === 'success' ? 'text-gr' : 'text-indigo-400'}>
                                        {log.message}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                        ) : scriptText ? (
                          <div className="space-y-6">
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                              <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
                                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 font-bold">Shooting Script Output</span>
                                <button onClick={() => copyToClipboard(scriptText)} className="p-1.5 hover:bg-slate-700 rounded transition-colors text-brand">
                                  <Copy className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="p-6 font-mono text-xs leading-relaxed text-slate-300 bg-black/30 min-h-[400px] whitespace-pre-wrap selection:bg-brand/30">
                                {scriptText}
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="flex flex-col gap-2 p-3 bg-brand/5 border border-brand/10 rounded-xl">
                                <div className="flex items-center gap-2 text-brand">
                                  <Zap className="w-3 h-3" />
                                  <span className="text-[9px] font-bold uppercase tracking-widest">Tính năng Nâng cao</span>
                                </div>
                                <p className="text-[10px] text-slate-500 italic">Nhấn "Mở rộng" nếu bạn muốn AI viết thêm các cảnh quay siêu chi tiết hoặc kịch bản bị cắt ngang do giới hạn bộ nhớ.</p>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={handleContinueScript}
                                    disabled={isProcessing}
                                    className="btn-secondary flex-1 py-2 text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 border-brand/20 text-brand/80"
                                  >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Mở rộng kịch bản
                                  </button>
                                  <button 
                                    onClick={() => copyToClipboard(scriptText)}
                                    className="btn-primary flex-1 py-2 text-[9px] uppercase tracking-widest flex items-center justify-center gap-2"
                                  >
                                    <Copy className="w-4 h-4" />
                                    Sao chép toàn bộ
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-slate-500 font-mono text-[10px]">
                              <span>Tokens generated: ~{Math.round(scriptText.length / 4)}</span>
                              <span>Pacing: Optimized for short-form</span>
                            </div>

                            {/* System Log Panel */}
                            <div className="mt-8 border-t border-slate-800 pt-6">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2 text-slate-500">
                                  <Terminal className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Nhật ký Hệ thống</span>
                                </div>
                                <button 
                                  onClick={clearLogs}
                                  className="text-[9px] text-slate-500 hover:text-brand uppercase tracking-tighter transition-colors"
                                >
                                  Xóa nhật ký
                                </button>
                              </div>
                              <div className="bg-slate-900 rounded-xl p-4 font-mono text-[10px] h-40 overflow-y-auto space-y-1 custom-scrollbar border border-slate-800">
                                {logs.length === 0 ? (
                                  <div className="text-slate-600 italic">Chưa có bản ghi nào...</div>
                                ) : (
                                  logs.map((log, i) => (
                                    <div key={i} className="flex gap-3 border-b border-slate-800/50 pb-1">
                                      <span className="text-slate-600 whitespace-nowrap">[{log.time}]</span>
                                      <span className={
                                        log.type === 'error' ? 'text-red-400' : 
                                        log.type === 'success' ? 'text-emerald-400' : 
                                        'text-blue-400'
                                      }>
                                        {log.message}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-3 border-2 border-dashed border-slate-800 rounded-3xl">
                            <FileText className="w-12 h-12 opacity-20" />
                            <p className="text-sm font-medium">Chưa có kịch bản. Hãy nhấn nút "Xuất kịch bản".</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Global Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md shadow-2xl border ${toast.type === 'success' ? 'bg-gr/20 border-gr/30 text-emerald-400' : 'bg-re/20 border-re/30 text-re'}`}>
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span className="text-xs font-bold font-mono tracking-tight">{toast.msg}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Right Sidebar: Context Panel */}
      <aside className="w-80 bg-s1 border-l border-slate-800 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-brand" />
          <span className="font-bold uppercase text-[10px] tracking-[0.2em] text-slate-500">Parameters</span>
        </div>

        <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              <span>Thời lượng</span>
              <span className="text-brand">Phút</span>
            </div>
            <input 
              type="number" 
              min="0.1" 
              step="0.1" 
              value={duration}
              onChange={e => setDuration(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none focus:border-brand/40 transition-colors shadow-inner"
              placeholder="Nhập số phút..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ý tưởng bổ trợ</label>
            <textarea 
              value={idea} onChange={e => setIdea(e.target.value)}
              placeholder="Nhập ghi chú hoặc phong cách viral cụ thể..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300 h-32 resize-none outline-none focus:border-brand/40 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              <span>Cấu hình AI nâng cao</span>
              <span className="text-indigo-400">Tùy chỉnh</span>
            </div>
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="Custom Endpoint URL..."
                defaultValue={localStorage.getItem('custom_ai_endpoint') || ''}
                onBlur={e => {
                  if (e.target.value) localStorage.setItem('custom_ai_endpoint', e.target.value);
                  else localStorage.removeItem('custom_ai_endpoint');
                  addLog('Đã cập nhật cấu hình Endpoint AI.', 'info');
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[10px] text-white font-mono outline-none focus:border-brand/40"
              />
              <input 
                type="password" 
                placeholder="Custom API Key (Optional)..."
                defaultValue={localStorage.getItem('custom_ai_key') || ''}
                onBlur={e => {
                  if (e.target.value) localStorage.setItem('custom_ai_key', e.target.value);
                  else localStorage.removeItem('custom_ai_key');
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[10px] text-white font-mono outline-none focus:border-brand/40"
              />
            </div>
            <p className="text-[9px] text-slate-600 italic">Để trống để dùng Gemini mặc định của hệ thống.</p>
          </div>

          <div className="pt-6 border-t border-slate-800">
            <div className="text-[10px] font-bold text-slate-500 mb-4 uppercase tracking-widest">Model Metrics</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/30">
                <div className="text-[8px] text-slate-600 uppercase font-bold mb-1">Temperature</div>
                <div className="text-xs font-bold">0.75</div>
              </div>
              <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/30">
                <div className="text-[8px] text-slate-600 uppercase font-bold mb-1">Top_P</div>
                <div className="text-xs font-bold text-emerald-400">0.9</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-brand/5 border border-brand/10 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-brand">
              <Info className="w-3 h-3" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Pro Tip</span>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-400 italic">"Nếu kịch bản dừng lại giữa chừng, đó là do đồng hồ AI của model. Hãy nhấn 'Mở rộng kịch bản' để hệ thống viết tiếp trang mới dựa trên context cũ."</p>
          </div>
        </div>

        <div className="mt-auto pt-4 space-y-3">
           <button onClick={() => { setScriptText(''); setStep('upload'); setFrames([]); setCharacters([]); setVideoUrl(''); }} className="w-full py-2 bg-slate-800 border border-slate-700 rounded-xl text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-white transition-all">Reset Project</button>
           <div className="text-[8px] text-center text-slate-700 font-mono tracking-widest opacity-50 uppercase">Engine: Gemini-3-Flash • ViralQuest v0.4.12</div>
        </div>
      </aside>

      {/* KB Modal (Enhanced) */}
      <AnimatePresence>
        {showKB && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md" onClick={() => setShowKB(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 max-w-4xl w-full max-h-[85vh] overflow-y-auto relative text-white custom-scrollbar shadow-2xl" onClick={e => e.stopPropagation()}>
              <button 
                onClick={() => setShowKB(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center hover:text-brand transition-colors"
              >
                <Trash2 className="w-5 h-5 rotate-45" />
              </button>

              <div className="mb-10 flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="font-display text-4xl font-extrabold tracking-tighter">Neural Knowledge</h2>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Model Insights v1.2.3 • Global Trends</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <section className="space-y-6">
                  <div className="font-display text-xs font-bold text-indigo-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <div className="w-6 h-[1px] bg-indigo-500/30"></div>
                    🛡️ AI Compliance Guard (Auto-Updated 24h)
                  </div>
                  <div className="space-y-4">
                    {complianceData ? (
                      Object.entries(complianceData.platforms).map(([name, data]: [string, any]) => (
                        <div key={name} className="p-4 bg-slate-800/80 border border-slate-700 rounded-2xl">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase text-white tracking-widest">{name}</span>
                            <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono uppercase tracking-tighter">Safe</span>
                          </div>
                          <ul className="text-[9px] text-slate-500 space-y-1 list-disc pl-3">
                            {data.rules.map((r: string, idx: number) => <li key={idx}>{r}</li>)}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <div className="animate-pulse flex space-y-4 flex-col">
                        <div className="h-12 bg-slate-800 rounded-xl w-full" />
                        <div className="h-12 bg-slate-800 rounded-xl w-full" />
                      </div>
                    )}
                  </div>
                </section>
                
                <section className="space-y-6">
                  <div className="font-display text-xs font-bold text-emerald-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <div className="w-6 h-[1px] bg-emerald-500/30"></div>
                    ℹ Viral Trends 2026
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {[
                      { t: 'Hyper-localized', d: 'Kể chuyện dựa trên mã định danh vùng miền cực bộ.' },
                      { t: 'AI Real-time Reaction', d: 'Phản ứng tức thời giữa nhân vật ảo và thế giới thật.' },
                      { t: 'Micro-memoirs', d: 'Hồi ký siêu ngắn 15s tập trung chuyển động mắt.' }
                    ].map((trend, i) => (
                      <div key={i} className="p-5 bg-slate-800 border border-slate-700 rounded-2xl hover:border-emerald-500/30 transition-colors group">
                        <div className="text-sm font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">{trend.t}</div>
                        <div className="text-[11px] text-slate-500 leading-relaxed">{trend.d}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
