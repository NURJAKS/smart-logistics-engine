import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { YMaps, Map, Placemark, Polyline } from '@pbe/react-yandex-maps';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, YAxis } from 'recharts';

const COURIER_COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#e11d48"];

export default function App() {
  const [viewMode, setViewMode] = useState('dispatcher'); // 'dispatcher' | 'driver'
  const [routes, setRoutes] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [hour, setHour] = useState(new Date().getHours()); 
  const [stats, setStats] = useState([{ name: 'VIP', count: 0 }, { name: 'Standard', count: 0 }]);
  const [efficiencyData, setEfficiencyData] = useState([]);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Привет! Я твой ИИ-диспетчер. Чем могу помочь? Я могу перестроить маршрут, изменить количество машин или симулировать ЧС.' }
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);
  const [deliveredJobs, setDeliveredJobs] = useState(new Set());
  const [numVehicles, setNumVehicles] = useState(3);
  const [unassignedJobs, setUnassignedJobs] = useState([]);


  const locations = [
    [39.7505, 37.0150], // 0: Депо
    [39.7540, 37.0250], [39.7420, 37.0100], [39.7610, 36.9950], // 1-3 VIP
    [39.7350, 37.0300], [39.7700, 36.9800], [39.7200, 37.0500], // 4-6 Standard
    [39.7800, 37.0600], [39.7100, 36.9500], [39.7900, 37.0800], // 7-9 Standard
    [39.7600, 37.0400] // 10 Standard
  ];



  useEffect(() => {
    const apiHost = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:18000`;
    // Преобразуем http://... в ws://... для вебсокета
    const wsUrl = apiHost.replace('http', 'ws') + '/ws';
    const socket = new WebSocket(wsUrl);
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);


    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'ALERT' || message.type === 'AUTO_UPDATE') {
        updateDashboard(message.data);
        if (message.data.ai_advice) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `🤖 Авто-коррекция: ${message.data.ai_advice}` }]);
        }
      }
    };
    return () => socket.close();
  }, []);

  const updateDashboard = (data) => {
    const rawRoutes = data.routes || data.new_routes;
    if (rawRoutes && Array.isArray(rawRoutes)) {
       const mappedRoutes = rawRoutes.map(routeObj => {
          if (routeObj.geometry && routeObj.geometry.length > 0) {
            return routeObj.geometry;
          }
          const steps = routeObj.steps || (Array.isArray(routeObj) ? routeObj : []);
          return [locations[0], ...steps.map(i => locations[i]), locations[0]];
       });
       setRoutes(mappedRoutes);
    }
    
    if (data.efficiency_stats) {
      setEfficiencyData([
        { name: 'Без ИИ', duration: data.efficiency_stats.baseline / 60, color: '#475569' },
        { name: 'С ИИ', duration: data.efficiency_stats.optimized / 60, color: '#3b82f6' }
      ]);
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `📈 Оптимизация завершена! Мы сэкономили ${data.efficiency_stats.savings} минут по сравнению с базовым маршрутом.` 
      }]);
    }
    
    if (data.sla_stats) {
      setStats(data.sla_stats);
    }
    
    if (data.unassigned) {
      setUnassignedJobs(data.unassigned);
    }

  };

  const calculateFleet = async (simulateIncident = false, params = {}) => {
    setLoading(true);
    try {
      const payload = { 
        locations: locations.map(loc => [loc[1], loc[0]]),
        num_vehicles: params.num_vehicles || numVehicles,
        hour: params.hour !== undefined ? params.hour : hour,
        is_snowstorm: params.is_snowstorm || false,
        "vehicles": Array.from({length: params.num_vehicles || numVehicles}, (_, i) => ({
          "id": i, "profile": "custom", "start_index": 0, "end_index": 0, "time_window": [0, 4 * 3600]
        })),
        "jobs": Array.from({length: locations.length - 1}, (_, i) => ({
          "id": i+1, "location_index": i+1, "priority": (i+1 <= 3) ? 100 : 10
        }))
      };

      const endpoint = (simulateIncident || params.is_snowstorm) ? 'simulate-issue' : 'plan-route';
      if (simulateIncident || params.is_snowstorm) payload.problem_index = params.problem_index || 2;


      const apiBase = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:18000`;
      console.log(`🚀 Sending ${endpoint} request to ${apiBase}:`, payload);
      const res = await axios.post(`${apiBase}/${endpoint}`, payload);
      updateDashboard(res.data);
      return res.data;
    } catch (error) {
      console.error("API Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setLoading(true);

    try {
      const apiBase = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:18000`;
      const res = await axios.post(`${apiBase}/chat`, { 
        message: chatInput,
        context: { 
          hour, 
          num_vehicles: numVehicles,
          "vehicles": Array.from({length: numVehicles}, (_, i) => ({
            "id": i, "profile": "custom", "start_index": 0, "end_index": 0, "time_window": [0, 4 * 3600]
          }))
        }
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.data.text }]);
        if (res.data.action) {
          console.log("🤖 AI Action Received:", res.data.action);
          const { function: funcName, args } = res.data.action;
          if (funcName === "replan_fleet") {
            const newHour = args.hour !== undefined ? args.hour : hour;
            const newVehicles = args.num_vehicles !== undefined ? args.num_vehicles : numVehicles;
            
            console.log(`🛠 Applying Replan: Hour=${newHour}, Vehicles=${newVehicles}`);
            if (args.hour !== undefined) setHour(newHour);
            if (args.num_vehicles !== undefined) setNumVehicles(newVehicles);
            
            await calculateFleet(false, { num_vehicles: newVehicles, hour: newHour });
          } else if (funcName === "simulate_weather_incident") {
            console.log("🛠 Applying Weather Incident Simulation");
            await calculateFleet(true, args);
          }
        }

    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Ошибка связи с ИИ." }]);
    } finally {
      setLoading(false);
    }
  };

  const toggleJob = (idx) => {
    const next = new Set(deliveredJobs);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setDeliveredJobs(next);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <div className="w-full md:w-[450px] min-h-[50vh] md:min-h-0 md:h-full bg-slate-900 flex flex-col border-b md:border-b-0 md:border-r border-slate-800 shadow-2xl z-20 shrink-0">
        
        {/* ROLE SWITCHER */}
        <div className="p-4 bg-slate-800/50 flex gap-2">
          <button 
            onClick={() => setViewMode('dispatcher')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'dispatcher' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
          >
            🛰 ДИСПЕТЧЕР
          </button>
          <button 
            onClick={() => setViewMode('driver')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'driver' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
          >
            🚚 ВОДИТЕЛЬ #1
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {viewMode === 'dispatcher' ? (
            <>
              <section>
                <h1 className="text-2xl font-bold text-white mb-1">Smart Fleet 4D</h1>
                <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-4">Command Center</p>
                
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700 mb-4">
                  <label className="flex justify-between text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-wider">
                    <span>🕒 Прогноз Трафика</span>
                    <span className="text-blue-400 text-sm">{hour}:00</span>
                  </label>
                  <input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(Number(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                </div>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => calculateFleet(false)} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold text-xs shadow-lg shadow-blue-900/20">{loading ? '...' : 'ОПТИМИЗИРОВАТЬ'}</button>
                  <button onClick={() => calculateFleet(true, { is_snowstorm: true })} disabled={loading} className="flex-1 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold text-xs border border-slate-700">❄️ СНЕЖНЫЙ БУРАН</button>
                </div>

              </section>

              {/* ANALYTICS BLOCK */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700 h-32 flex flex-col">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Эффективность (мин)</p>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={efficiencyData}>
                        <Bar dataKey="duration">
                          {efficiencyData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Bar>
                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#0f172a', border: 'none', fontSize: '10px'}} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700 h-32 flex flex-col">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">SLA Статус</p>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats} layout="vertical">
                        <XAxis type="number" hide domain={[0, 3]} />
                        <YAxis type="category" dataKey="name" hide />
                        <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} />
                        <Tooltip contentStyle={{backgroundColor: '#0f172a', border: 'none', fontSize: '10px'}} cursor={{fill: 'transparent'}} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

              {/* CHAT */}
              <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden flex flex-col h-[400px] shadow-inner">
                <div className="p-3 bg-slate-800/80 backdrop-blur-md text-[10px] font-bold text-slate-400 uppercase flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> 
                    AI DISPATCHER
                  </div>
                  <span className="text-[9px] text-slate-600">ENCRYPTED CHANNEL</span>
                </div>
                
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 scrollbar-hide">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                      <div className={`p-3 px-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-tr-none' 
                          : 'bg-slate-800/80 text-slate-200 border border-slate-700 rounded-tl-none'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-3 bg-slate-900/50 backdrop-blur-sm border-t border-slate-800 flex gap-2 items-end">
                  <div className="flex-1 bg-slate-800 rounded-xl px-4 py-3 border border-slate-700 focus-within:border-blue-500 transition-all flex items-center">
                      <input 
                        type="text" 
                        value={chatInput} 
                        onChange={(e) => setChatInput(e.target.value)} 
                        onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()} 
                        placeholder="Введите команду..." 
                        className="w-full bg-transparent border-none text-sm text-white placeholder-slate-500 outline-none min-h-[40px] flex items-center" 
                      />
                    </div>
                    <button 
                      onClick={sendChatMessage} 
                      className="bg-blue-600 hover:bg-blue-500 text-white w-12 h-12 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center flex-shrink-0"
                    >
                      <span className="text-xl leading-none">🚀</span>
                    </button>
                  </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-1">Маршрутный лист</h2>
              <p className="text-slate-500 text-xs mb-6 uppercase tracking-wider font-semibold">Водитель №1 • Курьер-Сити</p>
              
              {/* AI EMPATHY NOTIFICATION FOR DRIVER */}
              {chatMessages.filter(m => m.content.includes("Авто-коррекция")).length > 0 && (
                <div className="mb-6 bg-blue-600 rounded-2xl p-4 shadow-xl shadow-blue-900/40 border border-blue-400/30 animate-pulse-subtle">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">🤖</span>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">ИИ-Диспетчер: ВАЖНО</p>
                  </div>
                  <p className="text-sm font-medium text-white leading-snug">
                    {chatMessages.filter(m => m.content.includes("Авто-коррекция")).reverse()[0].content.replace("🤖 Авто-коррекция: ", "")}
                  </p>
                  <p className="text-[10px] mt-2 font-bold text-blue-200">СЛЕДУЙТЕ К БЛИЖАЙШЕЙ ТОЧКЕ В СПИСКЕ 👇</p>
                </div>
              )}

              <div className="space-y-3">
                {routes[0] ? routes[0].map((coords, i) => {
                  const jobIdx = i; // simple mapping
                  return i > 0 && i < routes[0].length - 1 && (
                    <div key={i} className={`p-4 rounded-xl border transition-all ${deliveredJobs.has(i) ? 'bg-green-900/20 border-green-700/50 opacity-60' : 'bg-slate-800/60 border-slate-700'}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-bold text-blue-400 mb-1 tracking-tighter uppercase">ЗАКАЗ #{1000 + i}</p>
                          <p className="text-sm font-bold text-slate-200">Адрес доставки {i}</p>
                        </div>
                        <button 
                          onClick={() => toggleJob(i)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${deliveredJobs.has(i) ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                          {deliveredJobs.has(i) ? '✓' : ''}
                        </button>
                      </div>
                    </div>
                  )
                }) : <p className="text-slate-500 italic text-sm">Маршрут пока не назначен...</p>}
              </div>
              <div className="mt-8 bg-blue-900/20 p-4 rounded-xl border border-blue-700/30">
                <p className="text-xs text-blue-300 leading-relaxed font-medium">💡 Совет: Двигайтесь через проспект Ататюрка, там сейчас меньше сугробов согласно прогнозу ИИ Сиваса.</p>
              </div>
            </>

          )}

        </div>
      </div>

      {/* MAP VIEW */}
      <div className="flex-1 relative h-[50vh] md:h-full w-full">
        <YMaps query={{ lang: 'ru_RU' }}>
          <Map 
            defaultState={{ center: [39.7505, 37.0150], zoom: 12 }} 
            width="100%" height="100%"
            options={{ suppressMapOpenBlock: true }}
          >
            {locations.map((loc, idx) => (
              <Placemark 
                key={idx} geometry={loc} 
                properties={{ iconContent: idx === 0 ? "ST" : `${idx}` }}
                options={{ 
                  preset: idx === 0 ? "islands#blackStretchyIcon" : "islands#blueCircleIcon",
                  iconColor: idx === 0 ? '#000' : 
                    unassignedJobs.includes(idx) ? '#64748b' : 
                    (idx <= 3 ? '#fbbf24' : '#3b82f6'),
                  opacity: unassignedJobs.includes(idx) ? 0.6 : 1
                }}

              />
            ))}
            
            {routes.map((routeCoords, index) => (
              (viewMode === 'dispatcher' || index === 0) && (
                <Polyline
                  key={index}
                  geometry={routeCoords}
                  options={{
                    strokeColor: COURIER_COLORS[index % COURIER_COLORS.length],
                    strokeWidth: 4,
                    strokeOpacity: 0.8,
                  }}
                />
              )
            ))}
          </Map>
        </YMaps>
        
        {/* FLOAT BADGE */}
        <div className="absolute top-6 right-6 px-4 py-2 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 text-[10px] font-bold text-slate-300 uppercase tracking-widest z-10 shadow-xl">
          Live Data Feed • {viewMode.toUpperCase()} MODE
        </div>
      </div>
    </div>
  );
}
