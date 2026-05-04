/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useEffect, useState, useMemo, useRef } from 'react';
import { Game } from './components/Game';
import { MobileControls } from './components/MobileControls';
import { useGameStore } from './store';
import { sfx } from './audio';
import { generateObstacles } from './components/Arena';

function HUD() {
  const gameState = useGameStore(state => state.gameState);
  const playerScore = useGameStore(state => state.playerScore);
  const botScore = useGameStore(state => state.botScore);
  const winScore = useGameStore(state => state.winScore);
  const playerHealth = useGameStore(state => state.playerHealth);
  const hitFlash = useGameStore(state => state.hitFlash);
  const timeLeft = useGameStore(state => state.timeLeft);
  const playerState = useGameStore(state => state.playerState);
  const events = useGameStore(state => state.events);
  const leaveGame = useGameStore(state => state.leaveGame);
  const targetedEntity = useGameStore(state => state.targetedEntity);
  const isMobile = useIsMobile();

  const [flashOpacity, setFlashOpacity] = useState(0);
  const [showHitMarker, setShowHitMarker] = useState(false);
  const hitMarkerTime = useGameStore(state => state.hitMarker);

  useEffect(() => {
    if (hitMarkerTime === 0) return;
    setShowHitMarker(true);
    const timer = setTimeout(() => setShowHitMarker(false), 200);
    return () => clearTimeout(timer);
  }, [hitMarkerTime]);

  useEffect(() => {
    if (hitFlash === 0) return;
    setFlashOpacity(1);
    const soundTimeout = setTimeout(() => {
        if (playerHealth <= 0) sfx.playDeath();
        else sfx.playDamage();
    }, 10);
    const interval = setInterval(() => {
      setFlashOpacity(prev => Math.max(0, prev - 0.1));
    }, 50);
    return () => {
        clearInterval(interval);
        clearTimeout(soundTimeout);
    }
  }, [hitFlash]);

  return (
    <>
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center z-10 transition-transform">
        <div className="relative w-8 h-8 flex items-center justify-center">
          {showHitMarker && (
            <svg className="absolute inset-0 w-full h-full text-white drop-shadow-[0_0_6px_rgba(255,255,255,1)] opacity-80" viewBox="0 0 100 100">
              <line x1="25" y1="25" x2="45" y2="45" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              <line x1="75" y1="25" x2="55" y2="45" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              <line x1="25" y1="75" x2="45" y2="55" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              <line x1="75" y1="75" x2="55" y2="55" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            </svg>
          )}
          <div className="relative flex items-center justify-center">
            {/* Top */}
            <div className={`absolute w-[2px] h-2 -translate-y-2 ${playerState === 'disabled' ? 'bg-red-500' : 'bg-green-400'}`} />
            {/* Bottom */}
            <div className={`absolute w-[2px] h-2 translate-y-2 ${playerState === 'disabled' ? 'bg-red-500' : 'bg-green-400'}`} />
            {/* Left */}
            <div className={`absolute w-2 h-[2px] -translate-x-2 ${playerState === 'disabled' ? 'bg-red-500' : 'bg-green-400'}`} />
            {/* Right */}
            <div className={`absolute w-2 h-[2px] translate-x-2 ${playerState === 'disabled' ? 'bg-red-500' : 'bg-green-400'}`} />
            {/* Center dot */}
            <div className={`absolute w-[2px] h-[2px] ${playerState === 'disabled' ? 'bg-red-500' : 'bg-green-400'}`} />
          </div>
        </div>
        {!isMobile && <div className="mt-4 absolute top-full text-stone-200/50 text-xs tracking-widest font-bold whitespace-nowrap">CLICK TO AIM</div>}
        
        {/* Target Info Overlay */}
        {targetedEntity && playerState === 'active' && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center justify-center z-10 transition-opacity">
            <div className="text-red-500 text-xs font-bold tracking-widest mb-1 shadow-sm">{targetedEntity.title}</div>
            <div className="flex gap-1 justify-center">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-3 h-1 border border-red-900/50 ${i < Math.max(0, targetedEntity.health) ? 'bg-red-500' : 'bg-red-900/30'}`} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Screen Flash on Hit */}
      {flashOpacity > 0 && (
        <>
            <div 
                className="absolute inset-0 bg-red-600 pointer-events-none z-0 mix-blend-screen" 
                style={{ opacity: flashOpacity * 0.5 }} 
            />
            <div 
                className="absolute inset-0 border-[16px] border-red-500 pointer-events-none z-10 box-border" 
                style={{ opacity: flashOpacity }} 
            />
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-red-500 text-4xl font-black drop-shadow-[0_0_15px_rgba(239,68,68,1)] tracking-widest z-10 pointer-events-none animate-bounce">
                SHIELD HIT!
            </div>
        </>
      )}

      {/* Minimap positioned on the top right */}
      {gameState === 'playing' && <Minimap />}

      {/* HUD Left - Score & Health */}
      <div className="absolute top-2 left-2 md:top-4 md:left-4 flex flex-col gap-2 md:gap-4 pointer-events-none z-10 p-2 bg-stone-900/50 backdrop-blur-md rounded border border-stone-700/50">
        <div className="flex gap-4 items-center">
            <div className="text-stone-200 text-lg md:text-2xl font-bold">
            YOU: {playerScore}
            </div>
            <div className="text-stone-400 text-lg md:text-2xl font-bold">
            BOT: {botScore}
            </div>
        </div>
        <div className="text-stone-300 text-xs uppercase tracking-widest font-bold">First to {winScore} wins</div>
        
        <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4, 5].map(hp => (
                <div key={hp} className={`w-6 h-6 md:w-8 md:h-8 border-2 ${hp <= playerHealth ? 'bg-amber-400 border-amber-200 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]' : 'bg-transparent border-stone-800'} rounded-sm`} />
            ))}
        </div>
      </div>
      
      {/* HUD Right - Time, Leave, Events */}
      <div className="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col items-end gap-1 md:gap-2 pointer-events-auto z-10">
        {gameState === 'playing' && (
          <div className="text-stone-200 text-lg md:text-2xl font-bold p-2 bg-stone-900/50 backdrop-blur-md rounded border border-stone-700/50 pointer-events-none">
            TIME: {Math.floor(timeLeft / 60)}:{(Math.floor(timeLeft) % 60).toString().padStart(2, '0')}
          </div>
        )}
        <button
          onClick={leaveGame}
          className="mt-2 px-2 py-1 md:px-4 md:py-2 bg-stone-800/80 border border-stone-600 text-stone-300 text-xs md:text-sm font-bold rounded hover:bg-stone-300 hover:text-stone-900 transition-all duration-200"
        >
          LEAVE
        </button>
        {!isMobile && <div className="text-stone-400 text-xs mt-1 pointer-events-none uppercase tracking-widest font-bold">ESC to unlock cursor</div>}

        {/* Event Log */}
        <div className="mt-2 md:mt-4 flex flex-col items-end gap-1 pointer-events-none">
          {events.slice(-3).map(event => (
            <div key={event.id} className="text-[10px] md:text-xs font-bold text-stone-200 bg-stone-800/80 px-2 py-1 rounded border border-stone-600 animate-pulse">
              {event.message}
            </div>
          ))}
        </div>
      </div>

      {/* Damage Overlay */}
      {playerState === 'disabled' && (
        <div className="absolute inset-0 bg-red-900/40 pointer-events-none flex items-center justify-center z-10 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <div className="text-red-500 text-4xl md:text-6xl font-black tracking-widest drop-shadow-[0_0_20px_rgba(239,68,68,1)] animate-pulse text-center">
                SYSTEM DISABLED
            </div>
            <div className="mt-4 text-orange-400 text-xl font-bold tracking-widest animate-bounce">
                RESPAWNING...
            </div>
          </div>
        </div>
      )}

      {/* Mobile Controls */}
      {isMobile && gameState === 'playing' && <MobileControls />}
    </>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return uaMatch || coarsePointer || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(uaMatch || coarsePointer || window.innerWidth < 768);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

// ... existing Code ...
function Minimap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const lasersContainerRef = useRef<HTMLDivElement>(null);
  
  // Create refs for enemies instead of mapping in React
  const enemyRefs = useRef<{ [id: string]: HTMLDivElement }>({});

  const obstacles = useMemo(() => generateObstacles(), []);

  useEffect(() => {
    let frameId: number;
    const MAP_SCALE = 1.5; // Scale down 100x100 to 150x150 px roughly
    
    function updateMap() {
      const state = useGameStore.getState();
      const playerPos = state.currentPlayerPos;
      const playerRot = state.currentPlayerRot;
      
      // Update Player
      if (playerRef.current) {
        // rotation is in radians. Three.js rotation.y: 0 is looking towards -Z. 
        // In 2D map, -Z is up. So we can just rotate the icon.
        playerRef.current.style.transform = `translate(${playerPos[0] * MAP_SCALE}px, ${playerPos[2] * MAP_SCALE}px) rotate(${playerRot}rad)`;
        playerRef.current.style.opacity = state.playerState === 'active' ? '1' : '0.2';
      }

      // Update Enemies
      const mapEl = mapRef.current;
      if (mapEl) {
        state.enemies.forEach(enemy => {
          let el = enemyRefs.current[enemy.id];
          if (!el) {
            el = document.createElement('div');
            el.className = 'absolute w-2 h-2 bg-red-500 rounded-sm -ml-1 -mt-1 shadow-sm';
            mapEl.appendChild(el);
            enemyRefs.current[enemy.id] = el;
          }
          el.style.transform = `translate(${enemy.position[0] * MAP_SCALE}px, ${enemy.position[2] * MAP_SCALE}px)`;
          el.style.opacity = enemy.state === 'active' ? '1' : '0.2';
        });
      }

      // Update Lasers
      const lasersEl = lasersContainerRef.current;
      if (lasersEl) {
        lasersEl.innerHTML = ''; // Rebuild lasers every frame is fine since they are short-lived
        state.lasers.forEach(laser => {
          const dx = laser.end[0] - laser.start[0];
          const dz = laser.end[2] - laser.start[2];
          const length = Math.sqrt(dx * dx + dz * dz) * MAP_SCALE;
          const angle = Math.atan2(dz, dx) * 180 / Math.PI;
          
          const line = document.createElement('div');
          line.className = 'absolute h-[1px] origin-left bg-amber-400 opacity-80';
          line.style.width = `${length}px`;
          line.style.transform = `translate(${laser.start[0] * MAP_SCALE}px, ${laser.start[2] * MAP_SCALE}px) rotate(${angle}deg)`;
          lasersEl.appendChild(line);
        });
      }
      
      frameId = requestAnimationFrame(updateMap);
    }
    
    frameId = requestAnimationFrame(updateMap);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const MAP_SCALE = 1.5;

  return (
    <div className="absolute top-4 right-4 w-32 h-32 bg-stone-800/80 border-2 border-stone-600 rounded-sm overflow-hidden backdrop-blur z-20 pointer-events-none">
      <div className="absolute inset-0">
        {/* Draw obstacles */}
        {obstacles.map((obs, i) => {
           if (obs.type !== 'box') return null;
           const w = obs.size[0] * MAP_SCALE;
           const h = obs.size[2] * MAP_SCALE;
           const x = obs.position[0] * MAP_SCALE + 64 - w / 2;
           const y = obs.position[2] * MAP_SCALE + 64 - h / 2;
           return (
             <div 
               key={i} 
               className="absolute bg-stone-500/50" 
               style={{ left: x, top: y, width: w, height: h }} 
             />
           );
        })}
      </div>
      
      {/* 0,0 is center of map, so we offset by 50% (64px) */}
      <div 
        ref={mapRef} 
        className="absolute top-1/2 left-1/2"
      >
        <div ref={lasersContainerRef} className="absolute inset-0" />
        <div 
          ref={playerRef} 
          className="absolute w-3 h-3 bg-amber-400 rounded-full shadow-sm z-10 flex items-center justify-center pointer-events-none"
          style={{ marginLeft: '-6px', marginTop: '-6px' }}
        >
          {/* A small pointer indicating forward (-Z which is up on the minimap) */}
          <div className="w-[2px] h-[6px] bg-black absolute top-0 rounded-t-sm" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const gameState = useGameStore(state => state.gameState);
  const playerScore = useGameStore(state => state.playerScore);
  const botScore = useGameStore(state => state.botScore);
  const winScore = useGameStore(state => state.winScore);
  const startGame = useGameStore(state => state.startGame);
  const isMobile = useIsMobile();

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden font-mono select-none">
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Game />
      </div>

      {/* UI Overlay */}
      {gameState === 'playing' && <HUD />}

      {/* Menus */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 bg-stone-900/90 flex flex-col items-center justify-center z-10 pointer-events-auto">
          <h1 className="text-6xl font-black text-stone-200 mb-8 tracking-wide">
            CUBIC ARENA
          </h1>
          <p className="text-stone-400 mb-8 text-center max-w-md">
            WASD to move. Mouse to look and shoot.<br/>
            First to {winScore} points wins.
          </p>

          <div className="flex flex-col gap-6 w-80">
            <button
              onClick={() => { 
                sfx.init(); 
                setTimeout(() => startGame(), 0);
              }}
              className="w-full px-8 py-4 bg-stone-800 border-2 border-stone-600 text-stone-300 text-xl font-bold rounded hover:bg-stone-300 hover:text-stone-900 transition-all duration-200"
            >
              PLAY NOW
            </button>
          </div>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-stone-900/90 flex flex-col items-center justify-center z-10 pointer-events-auto">
          <h1 className={`text-6xl font-black mb-4 tracking-wide ${playerScore >= winScore ? 'text-amber-400' : 'text-red-500'}`}>
            {playerScore >= winScore ? 'YOU WIN!' : 'BOT WINS!'}
          </h1>
          <div className="text-3xl text-stone-400 mb-8 font-bold">
            {playerScore} - {botScore}
          </div>
          <button
            id="start-button"
            onClick={() => { 
                sfx.init(); 
                setTimeout(() => startGame(), 0); 
            }}
            className="px-8 py-4 bg-stone-800 border-2 border-stone-600 text-stone-300 text-xl font-bold rounded hover:bg-stone-300 hover:text-stone-900 transition-all duration-200"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
