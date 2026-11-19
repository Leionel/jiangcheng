import type { CSSProperties } from 'react';
import type { RegionRunState } from '../domain/types';
import { RIVER_REGION, nodeProgress, regionComplete } from '../domain/region';

const CITY_REGIONS = [
  { id: 'zao', name: '过早巷', x: 14, y: 14, color: '#c58b25', note: '余温 / 市井' },
  { id: 'bridge', name: '桥影工坊', x: 27, y: 76, color: '#6b5b4e', note: '连接 / 断路' },
  { id: 'sakura', name: '樱语山坡', x: 84, y: 12, color: '#c06b82', note: '树影 / 记忆' },
  { id: 'thunder', name: '雷鸣创想站', x: 85, y: 74, color: '#2b7570', note: '装置 / 组合' },
];

const STOPS = [
  { x: 432, y: 196, labelSide: 'top' as const },
  { x: 528, y: 238, labelSide: 'bottom' as const },
  { x: 618, y: 266, labelSide: 'bottom' as const },
  { x: 704, y: 220, labelSide: 'top' as const },
  { x: 786, y: 176, labelSide: 'top' as const },
];

const STOP_TYPE_LABEL: Record<string, string> = {
  event: '事件',
  battle: '战斗',
  elite: '精英',
  boss: 'Boss',
};

function stopState(index: number, current: number, done: boolean): 'done' | 'current' | 'locked' {
  if (done || index < current) return 'done';
  if (index === current) return 'current';
  return 'locked';
}

function toPercent(x: number, y: number) {
  return { left: `${(x / 1200) * 100}%`, top: `${(y / 400) * 100}%` } as CSSProperties;
}

export function JiangchengMap({ run }: { run: RegionRunState }) {
  const done = regionComplete(run);
  const current = run.nodeIndex;
  const progress = nodeProgress(run);
  const routePoints = STOPS.map((stop) => `${stop.x} ${stop.y}`).join(' ');

  return (
    <div className="v2-map-wrap">
      <div className="v2-map-wide">
        <div className="v2-map-head">
          <div>
            <b>江风渡口 · 渡运观测图</b>
            <span>虚构观测 · 五站航线 · 潮位上涨</span>
          </div>
          <div className="v2-map-legend" aria-hidden="true">
            <span data-kind="route">渡口路线</span>
            <span data-kind="river">江流</span>
            <span data-kind="locked">未开放区域</span>
          </div>
        </div>
        <div className="v2-city-map">
          <svg viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden="true" className="v2-map-svg">
            <defs>
              <pattern id="v2-land-dots" width="22" height="22" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="4" r="0.9" fill="#14212b" fillOpacity="0.09" />
              </pattern>
            </defs>

            {/* 两片陆地 */}
            <path d="M-20 128 C 170 70 360 196 560 168 S 900 64 1220 112 L1220 -20 L-20 -20 Z" fill="#e9e5d8" />
            <path
              d="M-20 128 C 170 70 360 196 560 168 S 900 64 1220 112 L1220 -20 L-20 -20 Z"
              fill="url(#v2-land-dots)"
            />
            <path d="M-20 286 C 190 226 380 320 620 284 S 960 202 1220 246 L1220 420 L-20 420 Z" fill="#eeeadd" />
            <path
              d="M-20 286 C 190 226 380 320 620 284 S 960 202 1220 246 L1220 420 L-20 420 Z"
              fill="url(#v2-land-dots)"
              opacity="0.7"
            />

            {/* 江流底色 */}
            <path
              d="M-20 128 C 170 70 360 196 560 168 S 900 64 1220 112 L1220 246 C 960 202 800 300 620 284 S 190 226 -20 286 Z"
              fill="#dbe8ed"
            />

            {/* 江面手绘水纹：不再用规则网点，改成长短不一的墨线 */}
            <g stroke="#1b4e75" fill="none" strokeLinecap="round" opacity="0.5">
              <path d="M40 182 q 26 -10 52 0 t 52 0" strokeWidth="1.6" />
              <path d="M170 206 q 20 -8 40 0 t 40 0" strokeWidth="1.3" opacity="0.7" />
              <path d="M300 216 q 24 -9 48 0" strokeWidth="1.4" opacity="0.6" />
              <path d="M420 244 q 22 -8 44 0 t 44 0" strokeWidth="1.6" />
              <path d="M560 250 q 26 -10 52 0 t 52 0" strokeWidth="1.4" opacity="0.75" />
              <path d="M700 236 q 20 -8 40 0 t 40 0" strokeWidth="1.5" opacity="0.65" />
              <path d="M840 196 q 24 -9 48 0 t 48 0" strokeWidth="1.6" opacity="0.8" />
              <path d="M1000 180 q 22 -8 44 0" strokeWidth="1.3" opacity="0.6" />
              <path d="M1080 210 q 20 -8 40 0" strokeWidth="1.2" opacity="0.45" />
              <path d="M120 240 q 18 -7 36 0" strokeWidth="1.2" opacity="0.45" />
            </g>

            {/* 河岸线 */}
            <path
              d="M-20 128 C 170 70 360 196 560 168 S 900 64 1220 112"
              fill="none"
              stroke="#1b4e75"
              strokeOpacity="0.6"
              strokeWidth="2.5"
            />
            <path
              d="M-20 286 C 190 226 380 320 620 284 S 960 202 1220 246"
              fill="none"
              stroke="#1b4e75"
              strokeOpacity="0.6"
              strokeWidth="2.5"
            />

            {/* 支流 */}
            <path
              d="M742 0 C 736 56 726 96 706 136 C 690 168 688 200 704 220"
              fill="none"
              stroke="#dbe8ed"
              strokeWidth="30"
            />
            <path
              d="M742 0 C 736 56 726 96 706 136 C 690 168 688 200 704 220"
              fill="none"
              stroke="#1b4e75"
              strokeOpacity="0.5"
              strokeWidth="2"
              strokeDasharray="7 6"
            />

            {/* 五区色彩：低饱和色块提示区域气质，不画硬边界 */}
            <g opacity="0.55">
              <path d="M48 52 C 92 34 148 36 190 54 C 214 64 210 90 184 100 C 144 116 90 110 60 96 C 40 86 34 62 48 52 Z" fill="#c58b25" fillOpacity="0.14" />
              <path d="M236 300 C 278 286 330 288 356 304 C 374 316 366 338 340 344 C 300 354 256 348 238 334 C 226 324 224 308 236 300 Z" fill="#6b5b4e" fillOpacity="0.12" />
              <path d="M930 30 C 978 16 1040 22 1072 42 C 1092 56 1082 78 1052 86 C 1008 98 954 90 930 74 C 914 62 914 40 930 30 Z" fill="#c06b82" fillOpacity="0.12" />
              <path d="M930 292 C 976 280 1032 286 1060 304 C 1078 316 1070 336 1042 342 C 1002 352 952 346 932 330 C 918 318 918 302 930 292 Z" fill="#2b7570" fillOpacity="0.1" />
            </g>

            {/* 等高线：只留几笔，避免地图变成草稿堆 */}
            <g fill="none" stroke="#14212b" strokeOpacity="0.12" strokeWidth="1.2">
              <path d="M60 62 q 80 -18 150 8 t 130 6" />
              <path d="M40 84 q 90 -14 160 10 t 150 4" />
              <path d="M60 336 q 90 -18 160 6 t 140 0" />
              <path d="M980 320 q 70 -8 130 8" />
            </g>

            {/* 桥一：单拱石桥 */}
            <g stroke="#14212b" fill="none" opacity="0.75">
              <path d="M248 190 H 354" strokeWidth="3" />
              <path d="M248 182 H 354" strokeWidth="1.4" strokeOpacity="0.55" />
              <path d="M264 190 Q 301 146 338 190" strokeWidth="2.6" />
              <path d="M278 172 v 18 M 301 158 v 32 M 324 172 v 18" strokeWidth="1.2" strokeOpacity="0.7" />
              <path d="M248 190 v 58 M 301 190 v 58 M 354 190 v 58" strokeWidth="2.4" />
              <path d="M240 248 h 122" strokeWidth="2" strokeOpacity="0.4" />
            </g>

            {/* 桥二：斜拉桥 */}
            <g stroke="#14212b" fill="none" opacity="0.75">
              <path d="M812 210 L 952 210" strokeWidth="3" />
              <path d="M812 202 L 952 202" strokeWidth="1.2" strokeOpacity="0.5" />
              <path d="M836 210 L 836 132 M 928 210 L 928 132" strokeWidth="3" />
              <path d="M836 140 L 872 210 M 836 156 L 892 210 M 836 172 L 912 210" strokeWidth="1" strokeOpacity="0.7" />
              <path d="M928 140 L 892 210 M 928 156 L 872 210 M 928 172 L 852 210" strokeWidth="1" strokeOpacity="0.7" />
              <path d="M812 210 L 812 258 M 952 210 L 952 258" strokeWidth="2.6" />
              <path d="M804 258 h156" strokeWidth="2" strokeOpacity="0.45" />
            </g>

            {/* 渡口路线 */}
            <polyline points={routePoints} fill="none" stroke="#faf8ef" strokeWidth="5" strokeOpacity="0.9" strokeLinejoin="round" />
            <polyline
              points={routePoints}
              fill="none"
              stroke="#e2402b"
              strokeWidth="3"
              strokeDasharray="11 8"
              strokeLinejoin="round"
            />

            {/* 岸边木栈桥 + 船 */}
            <g stroke="#14212b" strokeWidth="2" fill="none" opacity="0.7">
              <path d="M500 286 h40 v10 h-40 z M512 296 v14 M528 296 v14" />
            </g>
            <g transform="translate(150 236) scale(1.35)" stroke="#14212b" strokeWidth="1.8" fill="none" opacity="0.75" className="v2-map-boat">
              <path d="M-22 0 h44 l-7 13 h-30 z" />
              <path d="M-2 0 v-14 l16 14" />
              <path d="M-27 17 q 11 -7 22 0 t 22 0" strokeOpacity="0.5" />
            </g>

            {/* 陆地地标：放大、减少数量，让每块陆地有一个焦点 */}
            <g stroke="#14212b" fill="none" opacity="0.55">
              {/* 过早巷：热气小碗 + 桌 */} 
              <g transform="translate(76 92) scale(1.5)">
                <path d="M-14 0 h28 l-4 12 h-20 z" />
                <path d="M-10 -6 q 4 -5 0 -10 M 0 -6 q 4 -5 0 -10 M 10 -6 q 4 -5 0 -10" strokeOpacity="0.7" />
                <path d="M-20 16 h40" strokeOpacity="0.5" />
              </g>
              {/* 樱语山坡：一株樱花树 */}
              <g transform="translate(1062 96)">
                <path d="M0 34 v-20 M -8 20 l 8 -12 l 8 12" />
                <circle cx="-6" cy="8" r="6" />
                <circle cx="6" cy="4" r="5" />
                <circle cx="10" cy="14" r="4.5" />
                <circle cx="-10" cy="18" r="4" />
              </g>
              {/* 桥影工坊：拱桥剪影已在桥上，这里放一个工具箱 */}
              <g transform="translate(250 332)">
                <path d="M-14 0 h28 v12 h-28 z" />
                <path d="M-6 0 v-5 h12 v5" />
                <path d="M-14 6 h28" strokeOpacity="0.5" />
              </g>
              {/* 雷鸣创想站：线圈与闪电 */}
              <g transform="translate(1050 332)">
                <path d="M-16 0 h32 M -16 8 h32 M -16 16 h32" strokeOpacity="0.7" />
                <path d="M-4 0 l8 18 l-6 -2 l 8 10" strokeWidth="2.4" />
              </g>
              {/* 风雨电台：信号塔 */}
              <g transform="translate(790 78)">
                <path d="M0 38 l -12 -34 h24 z" />
                <path d="M0 4 v-10" />
                <path d="M-18 0 q 18 -12 36 0 M -26 -12 q 26 -17 52 0" strokeOpacity="0.45" />
              </g>
              {/* 稀疏的树，只作点缀 */}
              <g strokeOpacity="0.35">
                <path d="M910 300 l 7 -14 l 7 14 z M910 300 h14" />
                <path d="M916 300 v 6" />
              </g>
            </g>

            {/* 罗盘与比例尺 */}
            <g opacity="0.65">
              <circle cx="1136" cy="52" r="22" fill="none" stroke="#14212b" strokeWidth="1.5" />
              <path d="M1136 30 l 6 20 l -6 -5 l -6 5 z" fill="#14212b" />
              <text x="1136" y="92" textAnchor="middle" fontSize="12.5" fill="#14212b" fontFamily="'PingFang SC', 'Microsoft YaHei', sans-serif">
                N
              </text>
              <path d="M1024 360 h58 M1024 356 v8 M1053 356 v8 M1082 356 v8" stroke="#14212b" strokeWidth="1.5" />
              <text x="1088" y="364" fontSize="12.5" fill="#4c5a63" fontFamily="'PingFang SC', 'Microsoft YaHei', sans-serif">
                虚构比例
              </text>
            </g>
          </svg>

          {CITY_REGIONS.map((region) => (
            <span
              className="v2-map-region"
              key={region.id}
              style={{ left: `${region.x}%`, top: `${region.y}%`, '--region': region.color } as CSSProperties}
            >
              <b>{region.name}</b>
              <em>未开放 · {region.note}</em>
            </span>
          ))}
          <span
            className="v2-map-region"
            data-active="true"
            style={{ left: '50%', top: '12%', '--region': '#1b4e75' } as CSSProperties}
          >
            <b>江风渡口</b>
            <em>当前区域 · 潮位与雾航</em>
          </span>

          {STOPS.map((stop, index) => {
            const state = stopState(index, current, done);
            const node = RIVER_REGION.nodes[index];
            return (
              <span
                className="v2-map-stop"
                key={node.id}
                data-state={state}
                data-label={stop.labelSide}
                style={toPercent(stop.x, stop.y)}
                title={`${index + 1} ${node.title} · ${STOP_TYPE_LABEL[node.type]}`}
              >
                <span className="v2-map-stop-dot">{index + 1}</span>
                {index === current && !done ? (
                  <span className="v2-map-callout">
                    <b>{node.title}</b>
                    <em>当前节点 · {STOP_TYPE_LABEL[node.type]}</em>
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>

        <div className="v2-map-caption">
          <span>虚构江城观测图 · 河湾、桥与五区均为游戏设定，不代表真实地理</span>
          <span>渡口路线 {progress.current} / {progress.total} · 潮位为装饰意象</span>
        </div>
      </div>

      <div className="v2-map-mobile">
        <div className="v2-mobile-river" aria-hidden="true" />
        <ol className="v2-mobile-route">
          {RIVER_REGION.nodes.map((node, index) => {
            const state = stopState(index, current, done);
            return (
              <li className="v2-mobile-stop" data-state={state} key={node.id}>
                <span className="v2-map-stop-dot">{index + 1}</span>
                <div>
                  <b>{node.title}</b>
                  <span>{STOP_TYPE_LABEL[node.type]}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="fineprint">虚构江城 · 江风渡口路线；桌面端可看到完整城市观测图。</p>
      </div>

      <ol className="v2-route-key" aria-label="江风渡口五站">
        {RIVER_REGION.nodes.map((node, index) => {
          const state = stopState(index, current, done);
          return (
            <li className="v2-route-key-item" data-state={state} key={node.id}>
              <span className="v2-route-key-num">{index + 1}</span>
              <div>
                <b>{node.title}</b>
                <span>{STOP_TYPE_LABEL[node.type]}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

