/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

export type GameState = 'menu' | 'playing' | 'gameover';
export type EntityState = 'active' | 'disabled';

export interface EnemyData {
  id: string;
  position: [number, number, number];
  state: EntityState;
  disabledUntil: number;
  health: number;
}

export interface PlayerData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: EntityState;
  disabledUntil: number;
  score: number;
  color: string;
}

export interface LaserData {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  timestamp: number;
  color: string;
}

export interface ParticleData {
  id: string;
  position: [number, number, number];
  timestamp: number;
  color: string;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

interface GameStore {
  gameState: GameState;
  playerScore: number;
  botScore: number;
  winScore: number;
  playerHealth: number;
  hitFlash: number;
  hitMarker: number;
  respawnTrigger: number;
  playerSpawnPos: [number, number, number];
  currentPlayerPos: [number, number, number];
  currentPlayerRot: number;
  
  timeLeft: number;
  playerState: EntityState;
  playerDisabledUntil: number;
  enemies: EnemyData[];
  targetedEntity: { id: string; health: number; title: string } | null;
  setTargetedEntity: (entity: { id: string; health: number; title: string } | null) => void;
  lasers: LaserData[];
  particles: ParticleData[];
  events: GameEvent[];
  
  // Multiplayer
  socket: Socket | null;
  otherPlayers: Record<string, PlayerData>;

  startGame: () => void;
  endGame: () => void;
  leaveGame: () => void;
  updateTime: (delta: number) => void;
  hitPlayer: () => void;
  hitEnemy: (id: string, damage?: number, byPlayer?: boolean) => void;
  addLaser: (start: [number, number, number], end: [number, number, number], color: string) => void;
  addParticles: (position: [number, number, number], color: string) => void;
  addEvent: (message: string) => void;
  updateEnemies: (time: number) => void;
  cleanupEffects: (time: number) => void;
  setPlayerState: (state: EntityState) => void;
  respawnBoth: () => void;
  triggerHitFlash: () => void;
  
  // Multiplayer actions
  updatePlayerPosition: (position: [number, number, number], rotation: number) => void;

  // Mobile Controls
  mobileInput: {
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
  };
  setMobileInput: (input: Partial<{
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
  }>) => void;
}

const PLAYER_SPAWN_POINTS: [number, number, number][] = [
  [-15, 2, -35],
  [15, 2, -35],
  [0, 2, -45]
];

const ENEMY_SPAWN_POINTS: [number, number, number][] = [
  [-15, 2, 35],
  [15, 2, 35],
  [0, 2, 45]
];

function getRandomSpawn(points: [number, number, number][]) {
  return points[Math.floor(Math.random() * points.length)];
}

const INITIAL_ENEMIES: EnemyData[] = [
  { id: 'bot-1', position: getRandomSpawn(ENEMY_SPAWN_POINTS), state: 'active', disabledUntil: 0, health: 5 },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: 'menu',
  playerScore: 0,
  botScore: 0,
  winScore: 5,
  playerHealth: 5,
  hitFlash: 0,
  hitMarker: 0,
  respawnTrigger: 0,
  playerSpawnPos: [0, 1, -25],
  currentPlayerPos: [0, 1, -25],
  currentPlayerRot: 0,
  timeLeft: 120, // 2 minutes
  playerState: 'active',
  playerDisabledUntil: 0,
  enemies: [],
  targetedEntity: null,
  setTargetedEntity: (entity) => set({ targetedEntity: entity }),
  lasers: [],
  particles: [],
  events: [],
  
  socket: null,
  otherPlayers: {},

  mobileInput: {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    shooting: false
  },

  setMobileInput: (input) => set((state) => ({
    mobileInput: { ...state.mobileInput, ...input }
  })),

  startGame: () => {
    const { socket } = get();
    
    if (socket) {
      socket.disconnect();
    }

    let newSocket: Socket | null = null;

    // Initialize multiplayer
    newSocket = io(window.location.origin);
    
    newSocket.on('connect', () => {
      newSocket!.emit('joinGame');
    });

    newSocket.on('gameError', (msg: string) => {
      alert(msg);
      get().leaveGame();
    });

    newSocket.on('gameJoined', (players: Record<string, PlayerData>) => {
      const otherPlayers = { ...players };
      delete otherPlayers[newSocket!.id!];
      set({ 
        otherPlayers,
        gameState: 'playing',
        timeLeft: 120,
        playerScore: 0,
        botScore: 0,
        playerHealth: 5,
        playerSpawnPos: getRandomSpawn(PLAYER_SPAWN_POINTS),
        respawnTrigger: Date.now(),
        enemies: INITIAL_ENEMIES.map(e => ({ ...e, position: getRandomSpawn(ENEMY_SPAWN_POINTS), state: 'active', disabledUntil: 0, health: 5 }))
      });
    });

      newSocket.on('playerJoined', (player: PlayerData) => {
        set(state => ({
          otherPlayers: { ...state.otherPlayers, [player.id]: player },
          events: [...state.events, { id: Math.random().toString(), message: `${player.name} joined`, timestamp: Date.now() }]
        }));
      });

      newSocket.on('playerMoved', (data: { id: string, position: [number, number, number], rotation: number }) => {
        set(state => {
          if (!state.otherPlayers[data.id]) return state;
          return {
            otherPlayers: {
              ...state.otherPlayers,
              [data.id]: {
                ...state.otherPlayers[data.id],
                position: data.position,
                rotation: data.rotation
              }
            }
          };
        });
      });

      newSocket.on('playerShot', (data: { id: string, start: [number, number, number], end: [number, number, number], color: string }) => {
        set(state => ({
          lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start: data.start, end: data.end, timestamp: Date.now(), color: data.color }],
          particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position: data.end, timestamp: Date.now(), color: data.color }]
        }));
      });

      newSocket.on('playerHit', (data: { targetId: string, shooterId: string, targetDisabledUntil: number, shooterScore: number }) => {
        set(state => {
          const now = Date.now();
          const isLocalShooter = data.shooterId === newSocket!.id;
          const isLocalTarget = data.targetId === newSocket!.id;
          
          const shooterName = isLocalShooter ? 'You' : (state.otherPlayers[data.shooterId]?.name || 'Unknown');
          const targetName = isLocalTarget ? 'You' : (state.otherPlayers[data.targetId]?.name || 'Unknown');
          const eventMsg = `${shooterName} tagged ${targetName}`;
          const newEvent = { id: Math.random().toString(), message: eventMsg, timestamp: now };

          let newState: Partial<GameStore> = {
            events: [...state.events, newEvent]
          };

          if (isLocalTarget) {
            newState.playerState = 'disabled';
            newState.playerDisabledUntil = data.targetDisabledUntil;
          }

          if (isLocalShooter) {
            newState.playerScore = data.shooterScore;
          }

          // Update other players' states
          const players = { ...state.otherPlayers };
          let playersChanged = false;

          if (!isLocalTarget && players[data.targetId]) {
            players[data.targetId] = {
              ...players[data.targetId],
              state: 'disabled',
              disabledUntil: data.targetDisabledUntil
            };
            playersChanged = true;
          }

          if (!isLocalShooter && players[data.shooterId]) {
            players[data.shooterId] = {
              ...players[data.shooterId],
              score: data.shooterScore
            };
            playersChanged = true;
          }

          if (playersChanged) {
            newState.otherPlayers = players;
          }

          return newState;
        });
      });

      newSocket.on('playerLeft', (id: string) => {
        set(state => {
          const players = { ...state.otherPlayers };
          const playerName = players[id]?.name || 'Unknown';
          delete players[id];
          return { 
            otherPlayers: players,
            events: [...state.events, { id: Math.random().toString(), message: `${playerName} left`, timestamp: Date.now() }]
          };
        });
      });
    set({
      gameState: 'playing',
      playerScore: 0,
      botScore: 0,
      playerHealth: 5,
      playerSpawnPos: getRandomSpawn(PLAYER_SPAWN_POINTS),
      respawnTrigger: Date.now(),
      timeLeft: 120,
      playerState: 'active',
      playerDisabledUntil: 0,
      enemies: INITIAL_ENEMIES.map(e => ({ ...e, position: getRandomSpawn(ENEMY_SPAWN_POINTS), state: 'active', disabledUntil: 0, health: 5 })),
      lasers: [],
      particles: [],
      events: [],
      socket: newSocket,
      otherPlayers: {},
    });
  },

  endGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ gameState: 'gameover', socket: null });
  },

  leaveGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({
      gameState: 'menu',
      socket: null,
      otherPlayers: {},
      enemies: [],
      lasers: [],
      particles: [],
      events: [],
      playerScore: 0,
      botScore: 0,
      timeLeft: 120,
      playerState: 'active'
    });
  },

  updateTime: (delta) => set((state) => {
    if (state.gameState !== 'playing') return state;
    const newTime = state.timeLeft - delta;
    if (newTime <= 0) {
      if (state.socket) state.socket.disconnect();
      return { timeLeft: 0, gameState: 'gameover', socket: null };
    }
    return { timeLeft: newTime };
  }),

  triggerHitFlash: () => set({ hitFlash: Date.now() }),

  respawnBoth: () => set((state) => ({
    playerHealth: 5,
    playerState: 'active',
    playerSpawnPos: getRandomSpawn(PLAYER_SPAWN_POINTS),
    respawnTrigger: Date.now(),
    enemies: state.enemies.map(e => ({
      ...e,
      health: 5,
      state: 'active',
      position: getRandomSpawn(ENEMY_SPAWN_POINTS)
    }))
  })),

  hitPlayer: () => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    
    const newHealth = state.playerHealth - 1;
    
    if (newHealth <= 0) {
      const newBotScore = state.botScore + 1;
      const gameIsOver = newBotScore >= state.winScore;
      
      return {
        playerState: 'disabled',
        playerHealth: 0,
        botScore: newBotScore,
        hitFlash: Date.now(),
        playerDisabledUntil: Date.now() + 2000,
        gameState: gameIsOver ? 'gameover' : 'playing'
      };
    }
    
    return {
      playerHealth: newHealth,
      hitFlash: Date.now(),
    };
  }),

  hitEnemy: (id, damage = 1, byPlayer = false) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    // Check if it's a multiplayer player
    if (state.socket && state.otherPlayers[id]) {
      state.socket.emit('hitPlayer', id);
      return state;
    }

    const enemies = state.enemies.map(e => {
      if (e.id === id && e.state === 'active') {
        const newHealth = e.health - damage;
        if (newHealth <= 0) {
          return { ...e, state: 'disabled' as EntityState, health: 0, disabledUntil: Date.now() + 2000 };
        }
        return { ...e, health: newHealth };
      }
      return e;
    });

    const deadEnemy = enemies.find(e => e.id === id && e.health === 0);
    
    if (deadEnemy && byPlayer) {
      const newScore = state.playerScore + 1;
      const gameIsOver = newScore >= state.winScore;
      
      return {
        enemies,
        hitMarker: Date.now(),
        playerScore: newScore,
        gameState: gameIsOver ? 'gameover' : 'playing',
        events: [...state.events, { id: Math.random().toString(), message: `You tagged ${id}!`, timestamp: Date.now() }]
      };
    }

    return {
      enemies,
      hitMarker: byPlayer ? Date.now() : state.hitMarker,
    };
  }),

  addLaser: (start, end, color) => {
    const { socket } = get();
    if (socket) {
      socket.emit('shoot', { start, end, color });
    }
    set((state) => ({
      lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start, end, timestamp: Date.now(), color }]
    }));
  },

  addParticles: (position, color) => set((state) => ({
    particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position, timestamp: Date.now(), color }]
  })),

  addEvent: (message) => set((state) => ({
    events: [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }]
  })),

  updateEnemies: (time) => set((state) => {
    let shouldRespawnBoth = false;
    
    state.enemies.forEach(e => {
      if (e.state === 'disabled' && time > e.disabledUntil) {
        shouldRespawnBoth = true;
      }
    });
    
    if (state.playerState === 'disabled' && time > state.playerDisabledUntil) {
        shouldRespawnBoth = true;
    }

    if (shouldRespawnBoth) {
      return { 
        enemies: state.enemies.map(e => ({
          ...e,
          state: 'active' as EntityState,
          health: 5,
          position: getRandomSpawn(ENEMY_SPAWN_POINTS)
        })),
        playerState: 'active', 
        playerHealth: 5,
        playerSpawnPos: getRandomSpawn(PLAYER_SPAWN_POINTS),
        respawnTrigger: Date.now()
      };
    }

    // Normal movement update (which is actually handled in Enemy component, this is just for status)
    let changed = false;
    const enemies = state.enemies;
    
    // Also update other players' states
    let otherPlayers = state.otherPlayers;
    let playersChanged = false;
    Object.values(state.otherPlayers).forEach(p => {
      if (p.state === 'disabled' && time > p.disabledUntil) {
        if (!playersChanged) {
          otherPlayers = { ...state.otherPlayers };
          playersChanged = true;
        }
        otherPlayers[p.id] = { ...p, state: 'active' };
      }
    });

    return changed || playersChanged ? { enemies, otherPlayers } : state;
  }),

  cleanupEffects: (time) => set((state) => {
    const lasers = state.lasers.filter(l => time - l.timestamp < 200); // Lasers last 200ms
    const particles = state.particles.filter(p => time - p.timestamp < 500); // Particles last 500ms
    const events = state.events.filter(e => time - e.timestamp < 5000); // Events last 5s
    if (lasers.length !== state.lasers.length || particles.length !== state.particles.length || events.length !== state.events.length) {
      return { lasers, particles, events };
    }
    return state;
  }),

  setPlayerState: (playerState) => set({ playerState }),

  updatePlayerPosition: (position, rotation) => {
    get().currentPlayerPos = position;
    get().currentPlayerRot = rotation;
    const { socket } = get();
    if (socket) {
      socket.emit('updatePosition', { position, rotation });
    }
  }
}));
