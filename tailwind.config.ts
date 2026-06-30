import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'], theme: { extend: { colors: { night: '#030712', steel: '#8ee9ff', cyanbrand: '#23b7ff' }, boxShadow: { glow: '0 0 60px rgba(35,183,255,.22)' } } }, plugins: [] };
export default config;
