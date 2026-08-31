/**
 * RobotMascot — Realistic animated robot mascot
 * Jumps across letters, waves, scans, blinks, bounces
 * Used in the hero heading of the landing page
 */
import { useEffect, useRef, useState } from 'react'

// ── Inline CSS keyframes ──────────────────────────────────────────────────────
const STYLES = `
  @keyframes rm-float {
    0%,100% { transform: translateY(0) rotate(-1deg) scaleX(1); }
    20%     { transform: translateY(-6px) rotate(2deg) scaleX(1.02); }
    50%     { transform: translateY(-9px) rotate(-1deg) scaleX(0.98); }
    80%     { transform: translateY(-4px) rotate(1.5deg) scaleX(1.01); }
  }
  @keyframes rm-jump {
    0%,100% { transform: translateY(0) scaleY(1) scaleX(1); }
    10%     { transform: translateY(0) scaleY(0.75) scaleX(1.2); }
    30%     { transform: translateY(-22px) scaleY(1.05) scaleX(0.95); }
    55%     { transform: translateY(-28px) scaleY(1) scaleX(1); }
    75%     { transform: translateY(-14px) scaleY(1.02) scaleX(0.98); }
    90%     { transform: translateY(-3px) scaleY(0.85) scaleX(1.12); }
  }
  @keyframes rm-walk {
    0%   { transform: translateX(0) translateY(0); }
    25%  { transform: translateX(4px) translateY(-3px); }
    50%  { transform: translateX(8px) translateY(0); }
    75%  { transform: translateX(4px) translateY(-2px); }
    100% { transform: translateX(0) translateY(0); }
  }
  @keyframes rm-wave {
    0%,100% { transform: rotate(0deg); }
    20%     { transform: rotate(-40deg); }
    40%     { transform: rotate(15deg); }
    60%     { transform: rotate(-35deg); }
    80%     { transform: rotate(10deg); }
  }
  @keyframes rm-blink {
    0%,88%,100% { transform: scaleY(1); }
    92%          { transform: scaleY(0.08); }
    96%          { transform: scaleY(1); }
    98%          { transform: scaleY(0.08); }
  }
  @keyframes rm-scan {
    0%,100% { transform: rotate(-20deg) translateX(0); }
    30%     { transform: rotate(15deg)  translateX(3px); }
    60%     { transform: rotate(-8deg)  translateX(-2px); }
  }
  @keyframes rm-antenna {
    0%,100% { opacity:1; transform:scale(1); }
    50%     { opacity:0.3; transform:scale(1.6); }
  }
  @keyframes rm-glow {
    0%,100% { filter: drop-shadow(0 0 3px rgba(96,165,250,0.7)) drop-shadow(0 0 1px rgba(124,58,237,0.5)); }
    50%     { filter: drop-shadow(0 0 8px rgba(124,58,237,1)) drop-shadow(0 0 4px rgba(6,182,212,0.8)); }
  }
  @keyframes rm-chest-pulse {
    0%,100% { opacity:0.7; r:1.2px; }
    50%     { opacity:1; r:1.8px; }
  }
  @keyframes rm-leg-l {
    0%,100% { transform: rotate(0deg); }
    25%     { transform: rotate(-18deg); }
    75%     { transform: rotate(18deg); }
  }
  @keyframes rm-leg-r {
    0%,100% { transform: rotate(0deg); }
    25%     { transform: rotate(18deg); }
    75%     { transform: rotate(-18deg); }
  }
  @keyframes rm-bob {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(-2px); }
  }
  @keyframes rm-squash-land {
    0%,70%,100% { transform: scaleY(1) scaleX(1) translateY(0); }
    80%         { transform: scaleY(0.7) scaleX(1.3) translateY(3px); }
    90%         { transform: scaleY(1.1) scaleX(0.95) translateY(-2px); }
  }
`

// ── States: what the robot is doing ──────────────────────────────────────────
const STATES = ['float', 'jump', 'wave', 'scan', 'walk', 'idle']

export default function RobotMascot({ size = 28 }) {
  const [action, setAction] = useState('float')
  const timer = useRef(null)

  // Cycle through actions every 2.5–5 seconds
  useEffect(() => {
    const cycle = () => {
      const next = STATES[Math.floor(Math.random() * STATES.length)]
      setAction(next)
      const dur = 2500 + Math.random() * 2500
      timer.current = setTimeout(cycle, dur)
    }
    timer.current = setTimeout(cycle, 2000)
    return () => clearTimeout(timer.current)
  }, [])

  // Body animation based on action
  const bodyAnim = {
    float: 'rm-float 3s ease-in-out infinite',
    jump:  'rm-jump 1.1s cubic-bezier(.36,.07,.19,.97) infinite',
    wave:  'rm-bob 0.8s ease-in-out infinite',
    scan:  'rm-float 4s ease-in-out infinite',
    walk:  'rm-walk 0.6s ease-in-out infinite',
    idle:  'rm-bob 2.5s ease-in-out infinite',
  }[action] || 'rm-float 3s ease-in-out infinite'

  const armAnim = action === 'wave'
    ? 'rm-wave 0.7s ease-in-out infinite'
    : action === 'scan'
      ? 'rm-scan 1.8s ease-in-out infinite'
      : 'rm-scan 3s ease-in-out infinite'

  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size * 1.15,
        position: 'relative',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      <style>{STYLES}</style>

      <svg
        width={size}
        height={size * 1.15}
        viewBox="0 0 32 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        overflow="visible"
        style={{ animation: bodyAnim + ', rm-glow 2.5s ease-in-out infinite' }}
      >
        <defs>
          {/* Body gradient — deep navy → indigo */}
          <linearGradient id="rmBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b0764" />
            <stop offset="50%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          {/* Head gradient */}
          <linearGradient id="rmHead" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4c1d95" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          {/* Limb gradient */}
          <linearGradient id="rmLimb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#312e81" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
          {/* Screen gradient */}
          <linearGradient id="rmScreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.7" />
          </linearGradient>
          {/* Glass gradient */}
          <radialGradient id="rmGlass" cx="35%" cy="35%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0.1)" />
          </radialGradient>
          {/* Highlight */}
          <linearGradient id="rmHighlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Shadow filter */}
          <filter id="rmShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#7c3aed" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* ── DROP SHADOW ── */}
        <ellipse cx="16" cy="35" rx="7" ry="1.5"
          fill="rgba(124,58,237,0.25)"
          style={{ animation: action === 'jump' ? 'rm-squash-land 1.1s ease-in-out infinite' : undefined }}
        />

        {/* ── ANTENNA ── */}
        <line x1="16" y1="6" x2="16" y2="2.5" stroke="#a78bfa" strokeWidth="0.9" strokeLinecap="round" />
        <circle cx="16" cy="1.8" r="1.4" fill="#c4b5fd"
          style={{ animation: 'rm-antenna 1s ease-in-out infinite' }} />
        {/* Antenna glow ring */}
        <circle cx="16" cy="1.8" r="2.5" fill="none" stroke="#a78bfa" strokeWidth="0.4"
          style={{ animation: 'rm-antenna 1s ease-in-out infinite', opacity: 0.4 }} />

        {/* ── HEAD ── */}
        <rect x="8" y="6" width="16" height="12" rx="3.5"
          fill="url(#rmHead)" stroke="#6d28d9" strokeWidth="0.8"
          filter="url(#rmShadow)" />
        {/* Head highlight */}
        <rect x="9" y="7" width="14" height="4" rx="2"
          fill="url(#rmHighlight)" opacity="0.6" />

        {/* Visor / face screen */}
        <rect x="9.5" y="7.5" width="13" height="8" rx="2.5"
          fill="url(#rmScreen)" opacity="0.9" />
        <rect x="9.5" y="7.5" width="13" height="3" rx="2"
          fill="rgba(255,255,255,0.12)" />

        {/* Eyes */}
        <g style={{ animation: 'rm-blink 5s ease-in-out infinite', transformOrigin: '13px 11px' }}>
          {/* Left eye */}
          <rect x="10.5" y="9" width="4" height="3" rx="1.2" fill="#60a5fa" />
          <rect x="10.5" y="9" width="4" height="1.2" rx="0.8" fill="rgba(255,255,255,0.3)" />
          <circle cx="12" cy="10.2" r="0.6" fill="white" opacity="0.9" />
          <circle cx="12.8" cy="10.8" r="0.35" fill="rgba(0,0,0,0.7)" />
          {/* Right eye */}
          <rect x="17.5" y="9" width="4" height="3" rx="1.2" fill="#60a5fa" />
          <rect x="17.5" y="9" width="4" height="1.2" rx="0.8" fill="rgba(255,255,255,0.3)" />
          <circle cx="19" cy="10.2" r="0.6" fill="white" opacity="0.9" />
          <circle cx="19.8" cy="10.8" r="0.35" fill="rgba(0,0,0,0.7)" />
        </g>

        {/* Smile / mouth */}
        <path d="M12.5 14 Q16 16 19.5 14"
          stroke="#93c5fd" strokeWidth="0.8" fill="none" strokeLinecap="round" />

        {/* ── NECK ── */}
        <rect x="14" y="18" width="4" height="2" rx="1"
          fill="url(#rmLimb)" stroke="#4f46e5" strokeWidth="0.4" />

        {/* ── TORSO ── */}
        <rect x="7" y="19.5" width="18" height="11" rx="3.5"
          fill="url(#rmBody)" stroke="#5b21b6" strokeWidth="0.8" />
        {/* Torso highlight */}
        <rect x="8" y="20.5" width="16" height="3.5" rx="2"
          fill="url(#rmHighlight)" opacity="0.5" />
        {/* Chest panel */}
        <rect x="10" y="22" width="12" height="6" rx="2"
          fill="rgba(15,23,42,0.5)" stroke="rgba(96,165,250,0.3)" strokeWidth="0.5" />
        {/* Status LED */}
        <circle cx="16" cy="24" r="1.3" fill="#06b6d4"
          style={{ animation: 'rm-chest-pulse 1.2s ease-in-out infinite' }} />
        <circle cx="16" cy="24" r="2" fill="none" stroke="#06b6d4" strokeWidth="0.3"
          style={{ animation: 'rm-chest-pulse 1.2s ease-in-out infinite', opacity: 0.4 }} />
        {/* Mini display lines */}
        <line x1="11.5" y1="26.5" x2="14.5" y2="26.5" stroke="rgba(96,165,250,0.5)" strokeWidth="0.5" />
        <line x1="17.5" y1="26.5" x2="20.5" y2="26.5" stroke="rgba(96,165,250,0.5)" strokeWidth="0.5" />
        {/* Torso bolt details */}
        <circle cx="9.5" cy="21.5" r="0.5" fill="rgba(124,58,237,0.5)" />
        <circle cx="22.5" cy="21.5" r="0.5" fill="rgba(124,58,237,0.5)" />

        {/* ── LEFT ARM (wave arm) ── */}
        <g style={{
          transformOrigin: '7px 22px',
          animation: action === 'wave' ? armAnim : 'rm-bob 2s ease-in-out infinite',
        }}>
          <rect x="3.5" y="20.5" width="4" height="7" rx="2"
            fill="url(#rmLimb)" stroke="#5b21b6" strokeWidth="0.6" />
          {/* Hand */}
          <ellipse cx="5.5" cy="28.5" rx="2.2" ry="1.8"
            fill="url(#rmLimb)" stroke="#5b21b6" strokeWidth="0.5" />
          <circle cx="4.5" cy="28" r="0.5" fill="#60a5fa" opacity="0.7" />
          <circle cx="5.5" cy="29" r="0.5" fill="#60a5fa" opacity="0.7" />
          <circle cx="6.5" cy="28" r="0.5" fill="#60a5fa" opacity="0.7" />
        </g>

        {/* ── RIGHT ARM (magnifying glass) ── */}
        <g style={{ transformOrigin: '25px 22px', animation: armAnim }}>
          <rect x="24.5" y="20.5" width="4" height="7" rx="2"
            fill="url(#rmLimb)" stroke="#5b21b6" strokeWidth="0.6" />
          {/* Magnifying glass */}
          <circle cx="28.5" cy="30" r="3.5" fill="url(#rmGlass)"
            stroke="#fbbf24" strokeWidth="1.4" />
          <circle cx="28.5" cy="30" r="2.2" fill="rgba(251,191,36,0.08)" />
          {/* Lens glare */}
          <circle cx="27.2" cy="28.6" r="0.8" fill="rgba(255,255,255,0.4)" />
          {/* Handle */}
          <line x1="31" y1="32.5" x2="33" y2="34.5"
            stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
          {/* Scan line */}
          <line x1="26.5" y1="30" x2="30.5" y2="30"
            stroke="rgba(251,191,36,0.6)" strokeWidth="0.6" strokeLinecap="round" />
        </g>

        {/* ── LEGS ── */}
        {/* Left leg */}
        <g style={{
          transformOrigin: '11px 30px',
          animation: action === 'walk' ? 'rm-leg-l 0.5s ease-in-out infinite' : 'rm-bob 2.2s ease-in-out infinite 0.1s',
        }}>
          <rect x="9" y="30" width="5" height="5" rx="1.8"
            fill="url(#rmLimb)" stroke="#5b21b6" strokeWidth="0.6" />
          {/* Foot */}
          <rect x="7.5" y="34" width="7" height="2.5" rx="1.2"
            fill="#2563eb" stroke="#1d4ed8" strokeWidth="0.4" />
          <rect x="8" y="34" width="6" height="1" rx="0.5"
            fill="rgba(255,255,255,0.15)" />
        </g>
        {/* Right leg */}
        <g style={{
          transformOrigin: '21px 30px',
          animation: action === 'walk' ? 'rm-leg-r 0.5s ease-in-out infinite' : 'rm-bob 2.2s ease-in-out infinite 0.4s',
        }}>
          <rect x="18" y="30" width="5" height="5" rx="1.8"
            fill="url(#rmLimb)" stroke="#5b21b6" strokeWidth="0.6" />
          {/* Foot */}
          <rect x="16.5" y="34" width="7" height="2.5" rx="1.2"
            fill="#2563eb" stroke="#1d4ed8" strokeWidth="0.4" />
          <rect x="17" y="34" width="6" height="1" rx="0.5"
            fill="rgba(255,255,255,0.15)" />
        </g>
      </svg>
    </span>
  )
}
