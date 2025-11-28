import { useEffect, useRef, useState } from "react";

export default function LEDDotEditor() {
    const rows = 16;
    const cols = 32;
    const cellSize = 20; // px

    const [dots, setDots] = useState<number[][]>(Array.from({ length: rows }, () => Array(cols).fill(0)));

    // 내보내기 옵션 (LED 128바이트용)
    const [swapPairs, setSwapPairs] = useState(true); // [1,0,3,2,5,4,7,6]
    const [reverseNibble, setReverseNibble] = useState(false);
    const [invertBits, setInvertBits] = useState(false);
    const [singleLine, setSingleLine] = useState(true); // 한 줄 출력 옵션 (기본 ON)

    // .fnt 입력
    const [fntInput, setFntInput] = useState("");

    // 드래그 상태
    const [isDragging, setIsDragging] = useState(false);
    const dragValueRef = useRef<0 | 1>(1); // 드래그 중에 칠할 값(1=켜기, 0=끄기)
    const gridRef = useRef<HTMLDivElement | null>(null);

    // 마우스 올라가면 드래그 종료
    useEffect(() => {
        const up = () => setIsDragging(false);
        window.addEventListener("mouseup", up);
        window.addEventListener("touchend", up, { passive: true });
        return () => {
            window.removeEventListener("mouseup", up);
            window.removeEventListener("touchend", up);
        };
    }, []);

    const paintCell = (r: number, c: number, value: 0 | 1) => {
        setDots(prev => prev.map((row, ri) => (ri !== r ? row : row.map((v, ci) => (ci === c ? value : v)))));
    };

    // 마우스 시작: 좌클릭이면 현재칸 상태를 보고 dragValue 결정(토글 느낌)
    const onMouseDownCell = (r: number, c: number, e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        // 우클릭: 지우기
        if (e.button === 2) {
            dragValueRef.current = 0;
            paintCell(r, c, 0);
        } else {
            // 좌클릭: 현재 값이 1이면 지우기, 0이면 그리기
            const cur = dots[r][c];
            dragValueRef.current = cur ? 0 : 1;
            paintCell(r, c, dragValueRef.current);
        }
        setIsDragging(true);
    };

    // 마우스 이동 중 드래그 페인팅
    const onMouseEnterCell = (r: number, c: number) => {
        if (!isDragging) return;
        paintCell(r, c, dragValueRef.current);
    };

    // 우클릭 메뉴 방지(그리드 영역 전체)
    const onContextMenuGrid = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    // 터치 드래그 지원
    const onTouchStartGrid = (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (!gridRef.current) return;
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        const r = el?.dataset?.r;
        const c = el?.dataset?.c;
        if (r && c) {
            const ri = parseInt(r, 10);
            const ci = parseInt(c, 10);
            const cur = dots[ri][ci];
            dragValueRef.current = cur ? 0 : 1;
            paintCell(ri, ci, dragValueRef.current);
            setIsDragging(true);
        }
    };

    const onTouchMoveGrid = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const t = e.touches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        const r = el?.dataset?.r;
        const c = el?.dataset?.c;
        if (r && c) {
            paintCell(parseInt(r, 10), parseInt(c, 10), dragValueRef.current);
        }
    };

    // 공용: 32x16 dots -> 128바이트 프레임(16행 × 8바이트) [LED_Display용]
    const buildFrameBytes = () => {
        const out: number[] = [];
        const rev4 = (n: number) => ((n & 0b0001) << 3) | ((n & 0b0010) << 1) | ((n & 0b0100) >> 1) | ((n & 0b1000) >> 3);

        const pairOrder = swapPairs ? [1, 0, 3, 2, 5, 4, 7, 6] : [0, 1, 2, 3, 4, 5, 6, 7];

        for (let y = 0; y < rows; y++) {
            const nibbles: number[] = [];
            for (let n = 0; n < 8; n++) {
                let nib = 0;
                for (let k = 0; k < 4; k++) {
                    const x = n * 4 + k;
                    if (dots[y][x]) nib |= 1 << k; // LSB가 가장 왼쪽
                }
                if (reverseNibble) nib = rev4(nib);
                if (invertBits) nib ^= 0x0f;
                nibbles.push(nib);
            }
            for (const idx of pairOrder) out.push(nibbles[idx]);
        }
        return out; // length = 128
    };

    // 현재 dots(16x32)를 0/1 바이너리 배열 문자열로 내보내기
    const exportBinaryMatrix = () => {
        const lines = dots.map(row => "  [" + row.join(", ") + "]");
        const text = "[\n" + lines.join(",\n") + "\n];";

        navigator.clipboard.writeText(text);
        alert("현재 도트를 0/1 바이너리 배열로 클립보드에 복사했습니다!");
    };

    // LED_Display용 HEX 128바이트로 패킹 (C 배열 형태로 복사)
    const exportHexForLED = () => {
        const out = buildFrameBytes();
        const toHex = (v: number) => "0x" + v.toString(16).toUpperCase().padStart(2, "0");

        let pretty: string;
        if (singleLine) {
            const flat = out.map(toHex).join(", ");
            pretty = `{ ${flat} },`;
        } else {
            const lines: string[] = [];
            for (let y = 0; y < rows; y++) {
                const rowHex = out
                    .slice(y * 8, y * 8 + 8)
                    .map(toHex)
                    .join(", ");
                lines.push("  " + rowHex);
            }
            pretty =
                `// 16행 × 8바이트 = 128바이트 (LED_Display용)\n` +
                `// 옵션: swapPairs=${swapPairs}, reverseNibble=${reverseNibble}, invertBits=${invertBits}\n` +
                `static const uint8_t frame0[128] = {\n` +
                lines.join(",\n") +
                `\n};`;
        }

        navigator.clipboard.writeText(pretty);
        alert("LED_Display용 HEX 배열이 클립보드에 복사되었습니다!");
    };

    // ---------- 여기서부터 .fnt 헬퍼 ----------

    // (중요) 한 행(32비트)을 .fnt 토큰으로
    //  - row[x]에서 x=0이 LSB(bit0)
    //  - little-endian 바이트로 직렬화 후 헥사 8자리 (0이면 "0")
    function rowToFntToken(row: number[]): string {
        let v = 0;
        for (let x = 0; x < 32; x++) {
            if (row[x]) v |= 1 << x; // col0 -> bit0
        }
        if (v === 0) return "0";

        const bytes = [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];
        return bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(""); // 예: FE7FE01F
    }

    // 전체 dots(16×32) → .fnt 한 줄 문자열
    function exportFntFromDots(dotsSrc: number[][]): string {
        const tokens: string[] = [];
        for (let y = 0; y < 16; y++) {
            tokens.push(rowToFntToken(dotsSrc[y]));
        }
        // 공백 구분
        return tokens.join(" ");
    }

    // 레거시 헥사 한 줄(공백 섞여도 됨) -> 8헥사 × 16개로 정규화
    function normalizeLegacyHexLine(line: string): string {
        // 숫자/헥사만 추출
        const hex = line.toUpperCase().replace(/[^0-9A-F]/g, "");
        // 32비트(8헥사) × 16줄 = 128헥사
        if (hex.length !== 128) {
            throw new Error(`헥사 길이가 ${hex.length}자리입니다. 32비트×16줄이면 128자리여야 합니다. (지금 건 자동 포맷 불가)`);
        }

        const tokens: string[] = [];
        for (let i = 0; i < 16; i++) {
            tokens.push(hex.slice(i * 8, i * 8 + 8));
        }
        // "00000000 FE7FE01F ..." 이렇게 반환
        return tokens.join(" ");
    }

    const handleImportLegacyFnt = () => {
        try {
            // 1) 레거시 헥사 한 줄을 정규 .fnt 라인으로 변환
            const normalized = normalizeLegacyHexLine(fntInput);

            // 2) 정규 포맷으로 LED 도트 생성
            const newDots = importFntToDots(normalized);

            // 3) 그리드에 반영 + textarea도 정규 포맷으로 바꿔줌
            setDots(newDots);
            setFntInput(normalized);

            alert("레거시 헥사를 8자리×16개 .fnt 포맷으로 변환해서 적용했습니다.");
        } catch (e: any) {
            console.error(e);
            alert(e?.message ?? "레거시 헥사 포맷 중 오류가 발생했습니다.");
        }
    };
    // .fnt 한 줄 → 토큰 16개
    //  - 공백 단위로 자른 토큰 하나 = 32비트 값 하나(row 하나)
    //  - "0" 이면 그 줄 전체 0
    //  - 나머지는 길이에 상관없이 tokenToRow 안에서 8헥사로 패딩/슬라이스
    function parseFntLine(line: string): string[] {
        const rough = line
            .trim()
            .split(/\s+/)
            .filter(t => t.length > 0);

        const tokens: string[] = [];

        for (const raw of rough) {
            let s = raw.trim().toUpperCase();
            if (!s) continue;

            // 헥사만 남기기
            s = s.replace(/[^0-9A-F]/g, "");
            if (!s) continue;

            if (s === "0") {
                tokens.push("0");
            } else {
                tokens.push(s);
            }
            if (tokens.length === 16) break;
        }

        // 16줄이 안 되면 아래를 0으로 채워서 맞추기
        while (tokens.length < 16) tokens.push("0");

        // 16개 초과면 잘라냄
        if (tokens.length > 16) tokens.splice(16);

        return tokens;
    }

    const downloadFntFile = () => {
        const fntLine = exportFntFromDots(dots); // "00000000 FE7FE01F ..." 형식
        const blob = new Blob([fntLine + "\n"], {
            type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "font.fnt"; // 원하는 파일명
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    };
    // 토큰 하나 → 한 행 32비트 (0/1 배열)
    //  - s: 최대 8헥사
    //  - s 길이가 모자라면 왼쪽을 0으로 채움
    //  - FE7FE01F -> 바이트 [FE,7F,E0,1F]
    //  - v = FE | (7F<<8) | (E0<<16) | (1F<<24)
    //  - row[x] = (v >> x) & 1 (bit0 = 가장 왼쪽 칸)
    function tokenToRow(token: string): number[] {
        const row = Array(32).fill(0);
        if (!token || token === "0") return row;

        let s = token.toUpperCase().replace(/[^0-9A-F]/g, "");
        if (!s) return row;

        if (s.length < 8) {
            s = s.padStart(8, "0");
        } else if (s.length > 8) {
            s = s.slice(0, 8);
        }

        const b0 = parseInt(s.slice(0, 2), 16);
        const b1 = parseInt(s.slice(2, 4), 16);
        const b2 = parseInt(s.slice(4, 6), 16);
        const b3 = parseInt(s.slice(6, 8), 16);

        const v = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);

        for (let x = 0; x < 32; x++) {
            row[x] = (v >> x) & 1; // bit0 -> 맨 왼쪽
        }
        return row;
    }

    // 디버그용: 현재 dots를 다시 32비트 헥사로 찍어보기
    function debugPrintDotsAsHexRows(dotsSrc: number[][]) {
        console.log("=== dots -> 32비트 HEX ===");
        for (let y = 0; y < 16; y++) {
            const row = dotsSrc[y];
            let v = 0;
            for (let x = 0; x < 32; x++) {
                if (row[x]) v |= 1 << x; // bit0 -> 왼쪽
            }
            const bytes = [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];
            const hex = bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join("");
            console.log(`row ${y}: ${hex}`);
        }
    }

    // .fnt 한 줄 전체 → 16×32 dots
    function importFntToDots(line: string): number[][] {
        const tokens = parseFntLine(line);
        const newDots: number[][] = [];
        for (let y = 0; y < 16; y++) {
            newDots.push(tokenToRow(tokens[y]));
        }
        return newDots;
    }

    const exportFnt = () => {
        const fntLine = exportFntFromDots(dots);
        navigator.clipboard.writeText(fntLine);
        alert(".fnt 포맷 문자열이 클립보드에 복사되었습니다!");
    };

    const handleImportFnt = () => {
        try {
            const newDots = importFntToDots(fntInput);
            setDots(newDots);
            alert(".fnt 데이터를 LED 도트에 반영했습니다.");
        } catch (e) {
            console.error(e);
            alert(".fnt 파싱 중 오류가 발생했습니다. 형식을 확인해 주세요.");
        }
    };

    const clearAll = () => {
        setDots(Array.from({ length: rows }, () => Array(cols).fill(0)));
    };

    return (
        <div
            style={{
                display: "flex",
                gap: 16,
                flexDirection: "column",
                alignItems: "center",
                padding: 16,
                fontFamily: "system-ui, sans-serif",
                color: "#e5e7eb",
                background: "#111827",
                minHeight: "100vh",
            }}
        >
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>32×16 LED 도트 에디터 (한국제어 제작)</h1>

            <div
                style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={swapPairs} onChange={e => setSwapPairs(e.target.checked)} />쌍 교환 [1,0,3,2,5,4,7,6]
                </label>

                <span style={{ fontSize: 12, opacity: 0.8 }}>팁: 마우스 좌클릭 드래그=그리기, 우클릭 드래그=지우기, 터치 드래그 지원</span>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={singleLine} onChange={e => setSingleLine(e.target.checked)} />한 줄로 출력
                </label>
            </div>

            {/* X 축 번호 */}
            <div style={{ display: "flex", gap: 0, marginBottom: -8 }}>
                <div style={{ width: cellSize, textAlign: "center" }}> </div>
                {Array.from({ length: cols }, (_, c) => (
                    <div key={`xnum-${c}`} style={{ width: cellSize, fontSize: 8, textAlign: "center" }}>
                        {c + 1}
                    </div>
                ))}
            </div>

            {/* Y축 번호 + 도트 */}
            <div style={{ display: "flex", flexDirection: "row" }}>
                {/* Y 번호 */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {Array.from({ length: rows }, (_, r) => (
                        <div
                            key={`ynum-${r}`}
                            style={{
                                height: cellSize,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 8,
                                width: cellSize,
                            }}
                        >
                            {r + 1}
                        </div>
                    ))}
                </div>

                {/* 그리드 */}
                <div
                    ref={gridRef}
                    onContextMenu={onContextMenuGrid}
                    onTouchStart={onTouchStartGrid}
                    onTouchMove={onTouchMoveGrid}
                    style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
                        gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
                        boxShadow: "0 0 0 1px #374151",
                        background: "#111827",
                        touchAction: "none",
                        userSelect: "none",
                    }}
                >
                    {dots.map((row, r) =>
                        row.map((cell, c) => (
                            <button
                                key={`${r}-${c}`}
                                data-r={r}
                                data-c={c}
                                onMouseDown={e => onMouseDownCell(r, c, e)}
                                onMouseEnter={() => onMouseEnterCell(r, c)}
                                aria-label={`r${r} c${c}`}
                                style={{
                                    width: cellSize,
                                    height: cellSize,
                                    padding: 0,
                                    margin: 0,
                                    border: "1px solid #4b5563",
                                    backgroundColor: cell ? "#f97316" : "#1f2937",
                                    cursor: "crosshair",
                                }}
                                onMouseOverCapture={e => {
                                    (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLButtonElement).style.filter = "none";
                                }}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={exportHexForLED} style={btnStyle("#10B981")}>
                    복사하기 (HEX 128바이트)
                </button>

                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleImportFnt} style={btnStyle("#3B82F6")}>
                        .fnt → LED 적용
                    </button>
                    <button onClick={handleImportLegacyFnt} style={btnStyle("#6366F1")}>
                        레거시 헥사 → 포맷+적용
                    </button>
                </div>
                <button onClick={downloadFntFile} style={btnStyle("#4B5563")}>
                    .fnt 파일로 저장
                </button>

                <button onClick={clearAll} style={btnStyle("#6b7280")}>
                    전체 지우기
                </button>
                <button onClick={exportBinaryMatrix} style={btnStyle("#6b7280")}>
                    현재 도트 바이너리로
                </button>
            </div>

            {/* .fnt 입력 → LED 반영 */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginTop: 12,
                    width: 680,
                    maxWidth: "100%",
                }}
            >
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                    .fnt 불러오기 (행마다 32비트 값 하나씩, 공백 구분)
                    <br />
                    예) <code style={{ fontFamily: "monospace" }}>0 1FE07FFE 3FF07FFE 60180180 ...</code>
                </span>
                <textarea
                    value={fntInput}
                    onChange={e => setFntInput(e.target.value)}
                    rows={3}
                    style={{
                        width: "100%",
                        resize: "vertical",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #4b5563",
                        background: "#020617",
                        color: "#e5e7eb",
                        fontFamily: "monospace",
                        fontSize: 12,
                    }}
                    placeholder="0 1FE07FFE 3FF07FFE 60180180 ..."
                />
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleImportFnt} style={btnStyle("#3B82F6")}>
                        .fnt → LED 적용
                    </button>
                </div>
            </div>
        </div>
    );
}

function btnStyle(bg: string) {
    return {
        padding: "8px 12px",
        borderRadius: 8,
        border: "none",
        color: "white",
        background: bg,
        cursor: "pointer",
        fontWeight: 600,
    } as const;
}
