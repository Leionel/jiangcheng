import type { CSSProperties } from 'react';
import type { RegionId, SaveV2 } from '../domain/types';
import { REGIONS, REGION_ORDER, getEnemy } from '../domain/region';

const POS: Record<RegionId, { x: number; y: number; labelX: number; labelY: number }> = {
  river: { x: 600, y: 390, labelX: 600, labelY: 246 },
  zao: { x: 185, y: 150, labelX: 185, labelY: 34 },
  bridge: { x: 255, y: 560, labelX: 255, labelY: 646 },
  sakura: { x: 985, y: 160, labelX: 985, labelY: 36 },
  thunder: { x: 965, y: 565, labelX: 965, labelY: 646 },
};

function regionStatus(save: SaveV2, id: RegionId): { label: string; state: 'locked' | 'ready' | 'active' | 'done' } {
  const run = save.regionRuns[id];
  if (run?.completed) return { label: '已观测', state: 'done' };
  if (run) return { label: `进行中 ${Math.min(run.nodeIndex + 1, REGIONS[id].nodes.length)}/${REGIONS[id].nodes.length}`, state: 'active' };
  if (save.unlockedRegions.includes(id)) return { label: '可探索', state: 'ready' };
  return { label: '未解锁', state: 'locked' };
}

export function JiangchengMap({
  save,
  selectedRegionId,
  onSelect,
}: {
  save: SaveV2;
  selectedRegionId: RegionId;
  onSelect: (id: RegionId) => void;
}) {
  return (
    <div className="v2-world-wrap">
      <div className="v2-map-head">
        <div>
          <b>江城全图 · 五区观测</b>
          <span>虚构城市 · 一条江、五块地、五种锅气与电光</span>
        </div>
        <div className="v2-map-legend" aria-hidden="true">
          <span data-kind="route">观测路线</span>
          <span data-kind="river">江流</span>
          <span data-kind="locked">未解锁区域</span>
        </div>
      </div>

      <div className="v2-world-map">
        <svg viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="v2-world-svg">
          <defs>
            <pattern id="v2-world-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0 L0 0 0 40" fill="none" stroke="#14212b" strokeOpacity="0.06" strokeWidth="1" />
            </pattern>
            <pattern id="v2-world-water" width="18" height="14" patternUnits="userSpaceOnUse">
              <path d="M0 9 q 4.5 -4 9 0 t 9 0" fill="none" stroke="#1b4e75" strokeOpacity="0.22" strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="1200" height="720" fill="#e9e5d8" />
          <rect width="1200" height="720" fill="url(#v2-world-grid)" />

          {/* 江：贯穿全图的主江 + 南侧支流 */}
          <path
            d="M-20 330 C 180 286 330 400 560 354 C 780 312 940 250 1220 300 L1220 454 C 980 410 820 500 590 470 C 350 438 170 400 -20 436 Z"
            fill="#cfe1e8"
          />
          <path d="M-20 330 C 180 286 330 400 560 354 C 780 312 940 250 1220 300" fill="none" stroke="#1b4e75" strokeOpacity="0.55" strokeWidth="2.5" />
          <path d="M-20 436 C 170 400 350 438 590 470 C 820 500 980 410 1220 454" fill="none" stroke="#1b4e75" strokeOpacity="0.55" strokeWidth="2.5" />
          <path
            d="M-20 330 C 180 286 330 400 560 354 C 780 312 940 250 1220 300 L1220 454 C 980 410 820 500 590 470 C 350 438 170 400 -20 436 Z"
            fill="url(#v2-world-water)"
          />
          <path d="M330 700 C 320 620 300 540 330 470" fill="none" stroke="#cfe1e8" strokeWidth="56" />
          <path d="M330 700 C 320 620 300 540 330 470" fill="none" stroke="#1b4e75" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="8 8" />

          {/* 观测路线 */}
          <g fill="none" stroke="#e2402b" strokeWidth="3" strokeDasharray="12 9" opacity="0.8">
            <path d="M185 260 C 260 300 300 340 380 350" />
            <path d="M520 390 C 700 392 820 300 940 250" />
            <path d="M1040 250 C 1080 340 1040 460 990 520" />
            <path d="M870 590 C 700 620 480 600 340 570" />
            <path d="M300 480 C 260 440 220 380 200 300" />
          </g>

          {/* 陆地等高线 */}
          <g fill="none" stroke="#14212b" strokeOpacity="0.1" strokeWidth="1.2">
            <path d="M60 80 q 90 -18 160 8 t 150 4" />
            <path d="M60 104 q 80 -14 140 10" />
            <path d="M820 80 q 100 -20 180 0 t 140 10" />
            <path d="M900 110 q 90 -12 170 6" />
            <path d="M70 640 q 90 -18 160 4 t 120 0" />
          </g>

          {/* ================= 过早巷 ================= */}
          <g className="v2-vignette" data-region="zao">
            <ellipse cx="185" cy="170" rx="150" ry="105" fill="#c58b25" fillOpacity="0.13" />
            <ellipse cx="185" cy="170" rx="150" ry="105" fill="none" stroke="#c58b25" strokeOpacity="0.5" strokeDasharray="8 7" />
            <g stroke="#14212b" strokeWidth="2" fill="none" opacity="0.72">
              {/* 三个早点摊 */}
              <path d="M100 190 h54 v-24 h-54 z M100 166 l27 -18 l27 18" />
              <path d="M164 190 h50 v-20 h-50 z M164 170 l25 -16 l25 16" />
              <path d="M224 190 h46 v-22 h-46 z M224 168 l23 -14 l23 14" />
              {/* 桌子与碗 */}
              <path d="M108 190 v16 M146 190 v16 M108 206 h38" />
              <path d="M172 190 v14 M206 190 v14 M172 204 h34" />
              <path d="M116 164 q 5 -9 0 -18 M132 164 q 5 -9 0 -18 M180 164 q 5 -8 0 -16" strokeOpacity="0.55" />
              <path d="M232 176 q 5 -8 0 -16" strokeOpacity="0.55" />
            </g>
            <g stroke="#c58b25" strokeWidth="2.4" fill="none" opacity="0.85">
              <path d="M126 196 q 20 -8 40 0" />
              <path d="M190 194 q 18 -7 36 0" />
            </g>
          </g>

          {/* ================= 桥影工坊 ================= */}
          <g className="v2-vignette" data-region="bridge">
            <ellipse cx="255" cy="560" rx="145" ry="98" fill="#6b5b4e" fillOpacity="0.12" />
            <ellipse cx="255" cy="560" rx="145" ry="98" fill="none" stroke="#6b5b4e" strokeOpacity="0.5" strokeDasharray="8 7" />
            <g stroke="#14212b" strokeWidth="2.4" fill="none" opacity="0.78">
              {/* 支流上的拱桥 */}
              <path d="M170 548 h168" />
              <path d="M184 548 Q 254 500 324 548" />
              <path d="M170 548 v 62 M 338 548 v 62" />
              <path d="M186 536 v 12 M 218 512 v 36 M 254 500 v 48 M 290 512 v 36 M 322 536 v 12" strokeWidth="1.2" opacity="0.7" />
              {/* 工坊吊臂 */}
              <path d="M360 520 v-48 l-52 16" />
              <path d="M352 480 l 16 0 l 0 22" />
              <path d="M340 508 l 12 12 l 12 -12" />
              {/* 齿轮与木板 */}
              <circle cx="216" cy="610" r="16" />
              <circle cx="216" cy="610" r="6" />
              <path d="M216 590 v 40 M 196 610 h 40" strokeWidth="1" opacity="0.6" />
              <path d="M252 614 h 56 v 8 h-56 z M252 628 h 42 v 8 h-42" />
            </g>
            <g stroke="#6b5b4e" strokeWidth="2" fill="none" opacity="0.7">
              <path d="M300 590 q 24 -12 48 0" />
            </g>
          </g>

          {/* ================= 江风渡口 ================= */}
          <g className="v2-vignette" data-region="river">
            <ellipse cx="600" cy="392" rx="190" ry="115" fill="#1b4e75" fillOpacity="0.12" />
            <ellipse cx="600" cy="392" rx="190" ry="115" fill="none" stroke="#1b4e75" strokeOpacity="0.55" strokeDasharray="8 7" />
            <g stroke="#14212b" strokeWidth="2.2" fill="none" opacity="0.8">
              {/* 信号塔 */}
              <path d="M548 388 l 2 -104 M 584 388 l -2 -104" />
              <path d="M548 326 h 36 M 552 356 h 28 M 542 388 h 48" />
              <path d="M558 284 h 16 v 14 h-16 z" />
              <path d="M556 284 q 10 -10 20 0" />
              <path d="M530 284 q 14 -12 28 0 M 520 270 q 24 -18 48 0" strokeOpacity="0.45" />
              {/* 浮标 */}
              <path d="M650 430 l 10 -14 l 10 14 z" />
              <path d="M660 430 v 12" />
              {/* 码头栈桥 */}
              <path d="M610 446 h 94 v 8 h-94 z" />
              <path d="M626 454 v 16 M 654 454 v 16 M 682 454 v 16" />
              {/* 渡船 */}
              <g transform="translate(754 402)">
                <path d="M-34 0 h68 l-11 19 h-46 z" />
                <path d="M-4 0 v-24 l24 24" />
                <path d="M-40 26 q 16 -10 32 0 t 32 0" strokeOpacity="0.5" />
              </g>
            </g>
            <g stroke="#e2402b" strokeWidth="2" fill="none" opacity="0.8">
              <path d="M574 370 h 8 M 570 352 h 12" />
              <path d="M586 370 h 8" />
            </g>
          </g>

          {/* ================= 樱语山坡 ================= */}
          <g className="v2-vignette" data-region="sakura">
            <ellipse cx="985" cy="165" rx="155" ry="110" fill="#c06b82" fillOpacity="0.12" />
            <ellipse cx="985" cy="165" rx="155" ry="110" fill="none" stroke="#c06b82" strokeOpacity="0.5" strokeDasharray="8 7" />
            <g stroke="#14212b" strokeWidth="2.2" fill="none" opacity="0.75">
              {/* 山脊 */}
              <path d="M850 196 q 70 -72 150 -58 t 120 -8" strokeOpacity="0.35" />
              <path d="M870 214 q 70 -60 140 -48 t 110 -10" strokeOpacity="0.25" />
              {/* 樱花树 */}
              <path d="M966 198 v-44 M 966 166 l -26 -24 M 966 176 l 30 -30 M 966 154 l -12 -18" strokeWidth="3" />
              <g fill="#c06b82" fillOpacity="0.28" stroke="none">
                <circle cx="932" cy="130" r="18" />
                <circle cx="964" cy="112" r="22" />
                <circle cx="1000" cy="130" r="17" />
                <circle cx="982" cy="144" r="16" />
                <circle cx="946" cy="150" r="13" />
              </g>
              {/* 档案柜 */}
              <path d="M1040 200 h40 v-34 h-40 z M1040 182 h40 M1040 166 h40" />
              <path d="M1050 200 v 12 M 1070 200 v 12" />
              {/* 落樱 */}
              <g fill="#c06b82" stroke="none" fillOpacity="0.55">
                <circle cx="900" cy="150" r="2.2" />
                <circle cx="1014" cy="166" r="2" />
                <circle cx="1038" cy="140" r="2.4" />
              </g>
            </g>
          </g>

          {/* ================= 雷鸣创想站 ================= */}
          <g className="v2-vignette" data-region="thunder">
            <ellipse cx="965" cy="565" rx="150" ry="105" fill="#2b7570" fillOpacity="0.12" />
            <ellipse cx="965" cy="565" rx="150" ry="105" fill="none" stroke="#2b7570" strokeOpacity="0.5" strokeDasharray="8 7" />
            <g stroke="#14212b" strokeWidth="2.2" fill="none" opacity="0.78">
              {/* 厂房 */}
              <path d="M880 590 h88 v-58 h-88 z" />
              <path d="M892 566 h16 v16 h-16 z M920 566 h16 v16 h-16 z M948 566 h8 v16 h-8 z" />
              <path d="M880 548 l 14 -16 l 14 16 M 908 548 l 14 -16 l 14 16 M 936 548 l 14 -16 l 14 16" strokeOpacity="0.6" />
              {/* 线圈塔 */}
              <path d="M1010 600 l 24 -104 M 1058 600 l -24 -104" />
              <path d="M1018 570 h 32 M 1022 544 h 24 M 1026 518 h 16" />
              <path d="M1028 496 h 12 v 16 h-12 z" />
              <g stroke="#2b7570" strokeWidth="2" strokeOpacity="0.8">
                <path d="M1010 610 q 26 -12 52 0" />
                <path d="M1004 624 q 32 -14 64 0" />
              </g>
              {/* 闪电 */}
              <path d="M1078 500 l -14 24 h 14 l -10 24" stroke="#e2402b" strokeWidth="3" strokeLinejoin="round" />
              {/* 电线 */}
              <path d="M836 520 q 72 -20 144 0" strokeOpacity="0.4" strokeDasharray="5 6" />
            </g>
          </g>

          {/* 点缀：树、云、鸟 */}
          <g fill="none" stroke="#14212b" strokeWidth="1.5" opacity="0.3">
            <path d="M420 140 l 8 -16 l 8 16 z M420 140 h16 M 428 140 v 8" />
            <path d="M470 190 l 7 -14 l 7 14 z M470 190 h14 M 477 190 v 7" />
            <path d="M790 640 l 8 -16 l 8 16 z M790 640 h16 M 798 640 v 8" />
            <path d="M640 120 q 14 -8 28 0 M 654 112 q 10 -6 20 0" />
            <path d="M860 90 q 14 -8 28 0 M 874 82 q 10 -6 20 0" />
            <path d="M180 640 q 16 6 32 0 M 200 648 q 10 4 20 0" />
          </g>

          {/* 生活细节：路、树、人、烟、船，填满留给想象的空白 */}
          <g fill="none" stroke="#14212b" strokeWidth="1.5" opacity="0.3">
            <path d="M60 240 C 130 260 200 250 265 220 M 180 420 C 250 380 360 360 470 350" strokeDasharray="5 7" />
            <path d="M720 470 C 820 500 900 520 990 500" strokeDasharray="5 7" />
            <path d="M1060 220 C 1000 260 960 300 940 340" strokeDasharray="5 7" />
            {/* 路边的小房子 */}
            <path d="M72 252 h26 v20 h-26 z M72 252 l13 -10 l13 10" />
            <path d="M114 272 h18 v14 h-18 z M114 272 l9 -7 l9 7" />
            <path d="M1080 420 h30 v22 h-30 z M1080 420 l15 -11 l15 11" />
            <path d="M1104 442 v 10 M 1088 452 h28" />
            {/* 树 */}
            <path d="M500 120 l9 -18 l9 18 z M500 120 h18 M 509 120 v 8" />
            <path d="M548 148 l7 -14 l7 14 z M548 148 h14 M 555 148 v 6" />
            <path d="M700 620 l9 -18 l9 18 z M700 620 h18 M 709 620 v 8" />
            <path d="M744 646 l7 -14 l7 14 z M744 646 h14" />
            <path d="M420 560 l8 -16 l8 16 z M420 560 h16 M 428 560 v 7" />
            <path d="M840 120 l7 -14 l7 14 z M840 120 h14" />
          </g>
          <g opacity="0.32">
            {/* 过早巷排队的人 */}
            <g fill="none" stroke="#14212b" strokeWidth="1.6">
              <circle cx="132" cy="250" r="4" />
              <path d="M132 254 v 16 M 124 260 l 16 0 M 132 270 l -5 9 M 132 270 l 5 9" />
              <circle cx="150" cy="256" r="4" />
              <path d="M150 260 v 14 M 142 266 l 16 0 M 150 274 l -4 8 M 150 274 l 4 8" />
              <circle cx="168" cy="252" r="4" />
              <path d="M168 256 v 14 M 160 262 l 16 0 M 168 270 l -5 8 M 168 270 l 5 8" />
            </g>
            {/* 渡口等船的人 */}
            <g fill="none" stroke="#14212b" strokeWidth="1.6">
              <circle cx="670" cy="458" r="4" />
              <path d="M670 462 v 16 M 662 468 l 16 0 M 670 478 l -5 9 M 670 478 l 5 9" />
            </g>
            {/* 创想站的烟与电 */}
            <g fill="none" stroke="#14212b" strokeWidth="1.5" strokeOpacity="0.45">
              <path d="M902 532 q 8 -18 22 -16 q 14 2 12 18" />
              <path d="M930 504 q 12 -20 28 -14" />
              <path d="M846 470 h -40 M 806 470 l 10 -10 M 806 470 l 10 10" />
            </g>
          </g>

          {/* 罗盘与比例尺 */}
          <g opacity="0.7">
            <circle cx="1110" cy="620" r="24" fill="none" stroke="#14212b" strokeWidth="1.6" />
            <path d="M1110 596 l 7 22 l -7 -5 l -7 5 z" fill="#14212b" />
            <text x="1110" y="662" textAnchor="middle" fontSize="12.5" fill="#14212b" fontFamily="'PingFang SC', 'Microsoft YaHei', sans-serif">
              N
            </text>
            <path d="M80 690 h64 M80 686 v 8 M112 686 v 8 M144 686 v 8" stroke="#14212b" strokeWidth="1.5" />
            <text x="154" y="694" fontSize="12.5" fill="#4c5a63" fontFamily="'PingFang SC', 'Microsoft YaHei', sans-serif">
              虚构比例
            </text>
          </g>
        </svg>

        {/* HTML 区域标签：可点击、带状态 */}
        {REGION_ORDER.map((id) => {
          const region = REGIONS[id];
          const pos = POS[id];
          const status = regionStatus(save, id);
          return (
            <button
              type="button"
              className="v2-world-label"
              key={id}
              data-state={status.state}
              data-selected={id === selectedRegionId}
              style={{ left: `${(pos.labelX / 1200) * 100}%`, top: `${(pos.labelY / 720) * 100}%`, '--region': region.accent } as CSSProperties}
              onClick={() => onSelect(id)}
              aria-pressed={id === selectedRegionId}
            >
              <span className="v2-world-label-name">
                <i />
                {region.name}
              </span>
              <span className="v2-world-label-meta">{status.label}</span>
              <span className="v2-world-label-boss">Boss · {getEnemy(region.bossId)?.name ?? '未知'}</span>
            </button>
          );
        })}
      </div>

      <div className="v2-world-mobile">
        {REGION_ORDER.map((id) => {
          const region = REGIONS[id];
          const status = regionStatus(save, id);
          return (
            <button
              type="button"
              className="v2-world-mobile-item"
              key={id}
              data-state={status.state}
              data-selected={id === selectedRegionId}
              style={{ '--region': region.accent } as CSSProperties}
              onClick={() => onSelect(id)}
            >
              <span className="v2-world-mobile-mark">{region.name.slice(0, 1)}</span>
              <span>
                <b>{region.name}</b>
                <em>{status.label} · Boss {getEnemy(region.bossId)?.name}</em>
              </span>
            </button>
          );
        })}
      </div>

      <div className="v2-map-caption">
        <span>虚构江城观测图 · 五区、桥梁、渡口与地名均为游戏设定，不代表真实地理</span>
        <span>点击区域查看路线；完成前一区后解锁下一区</span>
      </div>
    </div>
  );
}
