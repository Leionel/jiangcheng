import type { ShapeKind, VisualRecipe } from '../../shared/types';

const INK = '#14212b';
const PAPER = '#faf8ef';

export type Mood = 'idle' | 'happy' | 'hurt' | 'angry';

type SilhouetteProps = {
  kind: ShapeKind;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

/**
 * 躯干轮廓：所有精灵都由 6 种基础体块构成。
 * 只使用实色填充 + 硬描边 —— 双色孔版印刷没有渐变。
 */
function Silhouette({ kind, fill, stroke = 'none', strokeWidth = 3, opacity = 1 }: SilhouetteProps) {
  const s = { fill, stroke, strokeWidth, strokeLinejoin: 'round' as const, opacity };

  switch (kind) {
    case 'round':
      return (
        <g {...s}>
          <ellipse cx="100" cy="108" rx="57" ry="54" />
          <ellipse cx="74" cy="162" rx="16" ry="9" />
          <ellipse cx="126" cy="162" rx="16" ry="9" />
        </g>
      );
    case 'blob':
      return (
        <g {...s}>
          <path d="M100 46c29-4 53 15 59 43 6 29-8 58-36 68-26 9-52 0-68-20-16-21-18-51-4-69 12-16 28-19 49-22z" />
          <ellipse cx="70" cy="160" rx="17" ry="9" />
          <ellipse cx="128" cy="160" rx="17" ry="9" />
        </g>
      );
    case 'tall':
      return (
        <g {...s}>
          <rect x="64" y="44" width="72" height="118" rx="34" />
          <ellipse cx="76" cy="160" rx="15" ry="9" />
          <ellipse cx="124" cy="160" rx="15" ry="9" />
        </g>
      );
    case 'spike':
      return (
        <g {...s}>
          <polygon points="62,64 72,22 86,60" />
          <polygon points="88,56 100,14 112,56" />
          <polygon points="114,60 128,22 138,64" />
          <ellipse cx="100" cy="112" rx="54" ry="48" />
          <ellipse cx="78" cy="158" rx="14" ry="8" />
          <ellipse cx="122" cy="158" rx="14" ry="8" />
        </g>
      );
    case 'wing':
      return (
        <g {...s}>
          <path d="M66 92C40 74 18 88 22 112c4 22 24 32 44 24z" />
          <path d="M134 92c26-18 48-4 44 20-4 22-24 32-44 24z" />
          <ellipse cx="100" cy="112" rx="46" ry="48" />
        </g>
      );
    case 'shard':
    default:
      return (
        <g {...s}>
          <path d="M100 40l52 50-14 70H62L48 90z" />
          <ellipse cx="78" cy="160" rx="14" ry="8" />
          <ellipse cx="124" cy="160" rx="14" ry="8" />
        </g>
      );
  }
}

function Crest({ kind, color }: { kind: VisualRecipe['crest']; color: string }) {
  switch (kind) {
    case 'sesame':
      return (
        <g fill={color} opacity="0.85">
          <ellipse cx="82" cy="78" rx="3.6" ry="2.6" transform="rotate(-18 82 78)" />
          <ellipse cx="112" cy="70" rx="3.4" ry="2.4" transform="rotate(22 112 70)" />
          <ellipse cx="136" cy="96" rx="3.2" ry="2.3" transform="rotate(-8 136 96)" />
          <ellipse cx="70" cy="112" rx="3.2" ry="2.3" transform="rotate(14 70 112)" />
          <ellipse cx="128" cy="126" rx="3.4" ry="2.4" transform="rotate(-24 128 126)" />
          <ellipse cx="96" cy="140" rx="3" ry="2.2" transform="rotate(8 96 140)" />
        </g>
      );
    case 'wave':
      return (
        <g stroke={color} strokeWidth="4.5" fill="none" opacity="0.75" strokeLinecap="round">
          <path d="M46 122q13-11 26 0t26 0t26 0t26 0" />
          <path d="M52 142q11-9 22 0t22 0t22 0" />
        </g>
      );
    case 'petal':
      return (
        <g fill={color} opacity="0.82">
          <ellipse cx="132" cy="58" rx="7" ry="9" transform="rotate(-22 132 58)" />
          <ellipse cx="146" cy="72" rx="7" ry="9" transform="rotate(58 146 72)" />
          <ellipse cx="140" cy="88" rx="7" ry="9" transform="rotate(112 140 88)" />
          <ellipse cx="124" cy="88" rx="7" ry="9" transform="rotate(158 124 88)" />
          <ellipse cx="120" cy="66" rx="7" ry="9" transform="rotate(-70 120 66)" />
          <circle cx="134" cy="76" r="4" fill={PAPER} />
        </g>
      );
    case 'gear':
      return (
        <g stroke={color} strokeWidth="4" fill="none" opacity="0.8">
          <circle cx="138" cy="64" r="9" />
          <path d="M138 51v-6M138 77v6M125 64h-6M151 64h6M129 55l-4-4M147 73l4 4M147 55l4-4M129 73l-4 4" strokeLinecap="round" />
        </g>
      );
    case 'frame':
      return (
        <g stroke={color} strokeWidth="3" opacity="0.5">
          <path d="M78 66v88M122 66v88M62 96h76" />
          <path d="M66 126h68" opacity="0.6" />
        </g>
      );
    default:
      return null;
  }
}

function Face({ mood }: { mood: Mood }) {
  const closed = mood === 'hurt' || mood === 'happy';

  return (
    <g>
      {closed ? (
        <g stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round">
          <path d={mood === 'happy' ? 'M72 100q10-10 20 0' : 'M72 104q10 8 20 0'} />
          <path d={mood === 'happy' ? 'M108 100q10-10 20 0' : 'M108 104q10 8 20 0'} />
        </g>
      ) : (
        <g>
          <ellipse cx="82" cy="101" rx="12.5" ry="13" fill={PAPER} stroke={INK} strokeWidth="2.6" />
          <ellipse cx="118" cy="101" rx="12.5" ry="13" fill={PAPER} stroke={INK} strokeWidth="2.6" />
          <circle cx="84" cy="103" r="5.4" fill={INK} />
          <circle cx="120" cy="103" r="5.4" fill={INK} />
          <circle cx="86" cy="100" r="1.7" fill={PAPER} />
          <circle cx="122" cy="100" r="1.7" fill={PAPER} />
        </g>
      )}

      {mood === 'angry' && (
        <g stroke={INK} strokeWidth="3.2" strokeLinecap="round">
          <path d="M70 84l20 7" />
          <path d="M130 84l-20 7" />
        </g>
      )}

      {mood === 'angry' ? (
        <path d="M92 128h16" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
      ) : mood === 'happy' ? (
        <path d="M91 124q9 12 18 0" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      ) : mood === 'hurt' ? (
        <path d="M90 128q5-6 10 0t10 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M94 126q6 5 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      )}

      {mood === 'hurt' && (
        <path d="M140 84q6 8 0 14" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.7" />
      )}
    </g>
  );
}

function Accessory({
  kind,
  part,
  palette,
}: {
  kind: VisualRecipe['accessory'];
  part: 'back' | 'front';
  palette: [string, string, string];
}) {
  const light = palette[2];

  if (kind === 'bowl' && part === 'back') {
    return <ellipse cx="100" cy="142" rx="62" ry="17" fill={light} stroke={INK} strokeWidth="3" />;
  }
  if (kind === 'bowl' && part === 'front') {
    return (
      <g>
        <path d="M40 144q60 46 120 0l-6 22q-54 32-108 0z" fill={light} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M58 156q42 22 84 0" stroke={palette[1]} strokeWidth="2.4" fill="none" opacity="0.5" />
      </g>
    );
  }
  if (kind === 'umbrella' && part === 'back') {
    return (
      <g>
        <path d="M100 64v92" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M100 156q10 8 16-2" stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M32 68q68-56 136 0-22-10-40 2-14-12-28 0-16-12-30 0-18-12-38-2z" fill={palette[1]} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M32 68q20 12 34 4M100 24v44M168 68q-20 12-34 4" stroke={PAPER} strokeWidth="2" fill="none" opacity="0.55" />
      </g>
    );
  }
  if (kind === 'cup' && part === 'back') {
    return (
      <g>
        <rect x="132" y="102" width="38" height="52" rx="7" fill={light} stroke={INK} strokeWidth="3" />
        <rect x="128" y="94" width="46" height="12" rx="5" fill={palette[1]} stroke={INK} strokeWidth="3" />
        <path d="M148 108v40" stroke={palette[1]} strokeWidth="2.4" opacity="0.45" />
      </g>
    );
  }
  if (kind === 'wing' && part === 'back') {
    return (
      <g fill={light} stroke={INK} strokeWidth="3" strokeLinejoin="round" opacity="0.95">
        <path d="M62 70C34 48 12 64 18 92c4 20 22 26 40 16z" />
        <path d="M138 70c28-22 50-6 44 22-4 20-22 26-40 16z" />
      </g>
    );
  }
  return null;
}

const GUARD_LAYERS = new Set(['guard-ribs', 'steam-shield', 'seal-shield', 'keystone', 'rim', 'pack', 'fold', 'arch']);
const STRIKE_LAYERS = new Set(['rain-blade', 'cannon', 'blade-petal', 'blade', 'spark', 'neon-coil', 'lock']);
const CROWN_LAYERS = new Set(['canopy', 'thermos-cap', 'lamp-post', 'halo', 'lantern']);
const AURA_LAYERS = new Set(['petal-cloud', 'healing-bloom', 'wake', 'tide', 'rain-lines', 'ink-swirl', 'pages', 'sesame-shell', 'hull']);

function EvolutionEffects({
  layers,
  palette,
  part,
}: {
  layers: string[];
  palette: [string, string, string];
  part: 'back' | 'front';
}) {
  if (layers.length === 0) return null;
  const [, dark, light] = palette;
  const hasGuard = layers.some((id) => GUARD_LAYERS.has(id));
  const hasStrike = layers.some((id) => STRIKE_LAYERS.has(id));
  const hasCrown = layers.some((id) => CROWN_LAYERS.has(id));
  const hasAura = layers.some((id) => AURA_LAYERS.has(id));

  if (part === 'back') {
    return (
      <g>
        {/* 进化印章光环：一眼分辨高阶造物 */}
        <circle cx="100" cy="108" r="78" fill="none" stroke={dark} strokeWidth="2.4" strokeDasharray="9 5" opacity="0.58" />
        <circle cx="100" cy="108" r="68" fill="none" stroke={dark} strokeWidth="1.2" opacity="0.28" />
        {hasStrike ? (
          <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
            <polygon points="34,48 64,86 50,96 22,56" fill={dark} />
            <polygon points="166,48 136,86 150,96 178,56" fill={dark} />
            <path d="M26 70l18-10M174 70l-18-10" stroke={light} strokeWidth="2.4" strokeLinecap="round" />
          </g>
        ) : null}
        {hasGuard ? (
          <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round">
            <path d="M28 84 L48 74 L48 136 L28 124 Z" fill={light} />
            <path d="M172 84 L152 74 L152 136 L172 124 Z" fill={light} />
            <path d="M36 90v28M164 90v28" stroke={dark} strokeWidth="2.4" strokeLinecap="round" />
          </g>
        ) : null}
      </g>
    );
  }

  return (
    <g>
      {hasCrown ? (
        <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
          <polygon points="82,42 90,22 100,34 110,22 118,42" fill={dark} />
          <circle cx="100" cy="18" r="4" fill={light} />
        </g>
      ) : null}
      {hasAura ? (
        <g fill={dark} opacity="0.72">
          <circle cx="34" cy="140" r="4" />
          <circle cx="166" cy="140" r="4" />
          <path d="M30 62l8-6-2 10zM170 62l-8-6 2 10z" />
        </g>
      ) : null}
    </g>
  );
}

export function MonsterSprite({
  recipe,
  mood = 'idle',
  className,
  title,
  svgId,
}: {
  recipe: VisualRecipe & { evolutionLayers?: string[] };
  mood?: Mood;
  className?: string;
  title?: string;
  svgId?: string;
}) {
  const [main, dark, light] = recipe.palette;
  const evoLayers = recipe.evolutionLayers ?? [];

  return (
    <svg
      id={svgId}
      className={className}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title ?? '精灵插画'}
    >
      {/* 地面墨点 */}
      <ellipse cx="100" cy="178" rx={evoLayers.length ? 60 : 50} ry="8" fill={dark} opacity="0.18" />

      <EvolutionEffects layers={evoLayers} palette={recipe.palette} part="back" />
      <Accessory kind={recipe.accessory} part="back" palette={recipe.palette} />

      {/* 套印错位：先印一层深墨，再压主色 */}
      <g transform="translate(5 6)" opacity="0.9">
        <Silhouette kind={recipe.shape} fill={dark} />
      </g>
      <Silhouette kind={recipe.shape} fill={main} stroke={INK} />

      <Crest kind={recipe.crest} color={dark} />
      <Face mood={mood} />

      <Accessory kind={recipe.accessory} part="front" palette={recipe.palette} />
      <EvolutionEffects layers={evoLayers} palette={recipe.palette} part="front" />

      {/* 高光：一小块纸白，像印漏的地方 */}
      <path
        d="M64 84q10-16 26-18"
        stroke={light}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
        transform="rotate(6 70 80)"
      />
    </svg>
  );
}
