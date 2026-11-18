// config.mjs — SOLMAR's tuning table: world size, palette, car models,
// mission rewards and save key. Every system reads from here so a balance
// tweak is one edit, not a hunt through the codebase.
export const WORLD_W = 5200;
export const WORLD_H = 3800;
export const ROAD_W = 120; // asphalt width of every street
export const ROAD_GAP = 520; // distance between parallel street centrelines
export const ROAD_FIRST = 260; // centreline of the first street
export const BEACH_Y = 3520; // sand starts here (south edge)
export const SEA_Y = 3680; // water starts here; nothing drives or walks past it
export const SAVE_KEY = 'solmar-save-v1';

export const VIEW_W = 1280;
export const VIEW_H = 720;

// Sun-soaked palette: bright sand, pastel buildings, turquoise sea.
// Screenshots must read at a glance, so nothing here is dark or muddy.
export const PALETTE = {
  ground: '#e8d9a8',
  groundAlt: '#dfd09c',
  sidewalk: '#cfc4a4',
  asphalt: '#8d9299',
  asphaltDark: '#7d8288',
  laneLine: '#f5f2e2',
  centreLine: '#ffd94d',
  sand: '#f2dfa0',
  sea: '#3fb3d8',
  seaDeep: '#2a93bd',
  grass: '#8fce7d',
  palmTrunk: '#8a6a4a',
  palmLeaf: '#3e9e4f',
  buildingRoof: '#b9ac8d',
  pierWood: '#a9805a',
};

export const BUILDING_COLORS = [
  '#f2c9a0', '#a8d8e8', '#f2a0a0', '#c8e8a0', '#e8d8f2',
  '#f2e2a0', '#a0c8f2', '#f2b8d8', '#b8e8d8', '#e8c8a0',
];

// Arcade car models. topSpeed in px/s; grip is lateral damping per second.
export const CAR_MODELS = {
  sedan: {
    label: 'Sedan', topSpeed: 470, accel: 330, brake: 620, grip: 7.5,
    turn: 2.6, hp: 100, len: 46, wid: 22,
    colors: ['#d84a4a', '#4a7dd8', '#e8e8e8', '#3aa655', '#c9a227'],
  },
  sports: {
    label: 'Sports', topSpeed: 640, accel: 470, brake: 700, grip: 8.5,
    turn: 3.1, hp: 100, len: 46, wid: 21,
    colors: ['#e82e2e', '#ff9d2e', '#2ec8e8', '#f2f2f2'],
  },
  taxi: {
    label: 'Taxi', topSpeed: 470, accel: 330, brake: 620, grip: 7.5,
    turn: 2.6, hp: 100, len: 46, wid: 22, colors: ['#f2c41e'],
  },
  van: {
    label: 'Van', topSpeed: 380, accel: 260, brake: 520, grip: 6.5,
    turn: 2.2, hp: 160, len: 54, wid: 24,
    colors: ['#e8e8e8', '#7a8a99', '#4a7dd8'],
  },
  pickup: {
    label: 'Pickup', topSpeed: 430, accel: 310, brake: 580, grip: 7.0,
    turn: 2.4, hp: 130, len: 50, wid: 23,
    colors: ['#c96a2e', '#3a5a8a', '#8a8a8a', '#a62e2e'],
  },
  cruiser: {
    label: 'SBPD Cruiser', topSpeed: 580, accel: 430, brake: 680, grip: 8.2,
    turn: 2.9, hp: 120, len: 47, wid: 22, colors: ['#1d2733'],
  },
};

export const MISSION_REWARDS = [250, 400, 600, 800, 1500];
export const MISSION_NAMES = [
  'First Wheels',
  'The Pickup',
  'Hot Delivery',
  'Payback at the Pier',
  'The Solmar Score',
];

export const WALK_SPEED = 178;
export const SPRINT_SPEED = 268;
export const PLAYER_R = 13;
export const RESPRAY_COST = 150;
export const STASH_VALUE = 300;
export const MAX_WANTED = 5;
