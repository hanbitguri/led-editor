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

    // .fnt / 레거시 헥사 입력
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

    // ---------- 여기서부터 .fnt / 레거시 헥사 헬퍼 ----------

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

    // 레거시 텍스트 헥사 한 줄 → 바이트 배열
    //  - 토큰 단위로 자르고
    //  - 각 토큰에서 헥사만 뽑아서 왼쪽부터 2글자씩 = 1바이트
    //  - 마지막 1글자 남으면 0x0X 한 바이트로 처리
    function legacyFntLineToBytes(line: string): number[] {
        const tokens = line
            .trim()
            .split(/\s+/)
            .filter(t => t.length > 0);

        const bytes: number[] = [];

        for (const raw of tokens) {
            let s = raw.toUpperCase().replace(/[^0-9A-F]/g, "");
            if (!s) continue;

            if (s === "0") {
                // 원래 파일에서도 "0" 하나가 00 한 바이트 의미
                bytes.push(0x00);
                continue;
            }

            while (s.length > 0) {
                if (s.length === 1) {
                    // 마지막 한 글자 남았을 때 -> 0x0X 한 바이트
                    bytes.push(parseInt(s, 16));
                    s = "";
                } else {
                    bytes.push(parseInt(s.slice(0, 2), 16));
                    s = s.slice(2);
                }
            }
        }

        return bytes;
    }

    // 바이트 배열(최소 64바이트) → 16×32 dots
    function bytesToDots32x16(bytes: number[]): number[][] {
        const buf = bytes.slice(0, 64);
        while (buf.length < 64) buf.push(0);

        const dots: number[][] = [];

        for (let y = 0; y < 16; y++) {
            const base = y * 4;
            const b0 = buf[base] ?? 0;
            const b1 = buf[base + 1] ?? 0;
            const b2 = buf[base + 2] ?? 0;
            const b3 = buf[base + 3] ?? 0;

            const v = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);

            const row: number[] = new Array(32).fill(0);
            for (let x = 0; x < 32; x++) {
                row[x] = (v >>> x) & 1;
            }
            dots.push(row);
        }

        return dots;
    }

    // 레거시 헥사 한 줄 → 바이트 스트림 → dots → 정규 .fnt 라인으로도 세팅
    const handleImportLegacyFnt = () => {
        try {
            const bytes = legacyFntLineToBytes(fntInput);
            const newDots = bytesToDots32x16(bytes);
            setDots(newDots);

            // textarea에는 정규화된 .fnt 라인을 보여주도록
            const normalizedFnt = exportFntFromDots(newDots);
            //setFntInput(normalizedFnt);

            alert("레거시 헥사를 해석해서 LED 도트 + .fnt 포맷으로 변환했습니다.");
        } catch (e: any) {
            console.error(e);
            alert(e?.message ?? "레거시 헥사 파싱 중 오류가 발생했습니다.");
        }
    };

    const downloadFntFile = () => {
        // 레거시 디코더 역함수로 만든 128글자 라인
        const line = exportLegacyStyleFromDots(dots);

        // 레거리 로더는 128바이트를 읽고, 우리는 그 뒤에 CRLF(\r\n)을 달아 저장
        const fntContent = line + "\r\n";

        const blob = new Blob([fntContent], {
            type: "text/plain;charset=us-ascii",
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
    function exportLegacyStyleFromDots(dots: number[][]): string {
        // 1) dots -> 레거시가 쓰는 64바이트(16행 × 4바이트, little-endian)
        const bytes: number[] = [];

        for (let y = 0; y < 16; y++) {
            let v = 0;
            for (let x = 0; x < 32; x++) {
                if (dots[y][x]) {
                    v |= 1 << x; // bytesToDots32x16 의 역연산
                }
            }
            // little-endian 4바이트
            bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
        }

        // 2) 64바이트 -> 레거시 스타일 128글자
        //    규칙:
        //      - 0x00       -> "0 "
        //      - 0x01~0x0F  -> "1 " ~ "F "
        //      - 0x10~0xFF  -> "10" ~ "FF"
        const hexChars = "0123456789ABCDEF";

        const encodeByte = (b: number): string => {
            if (b < 0x10) {
                return hexChars[b] + " "; // 한 자리 + 공백
            } else {
                return hexChars[b >> 4] + hexChars[b & 0x0f]; // 두 자리
            }
        };

        // 64바이트 × 2글자 = 128글자
        return bytes.map(encodeByte).join("");
    }

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
                <button onClick={exportBinaryMatrix} style={btnStyle("#4a5d83")}>
                    복사하기 (바이너리)
                </button>
                <button onClick={downloadFntFile} style={btnStyle("#1f519c")}>
                    .fnt 파일로 저장
                </button>

                <button onClick={clearAll} style={btnStyle("#6b7280")}>
                    전체 지우기
                </button>
            </div>

            {/* .fnt / 레거시 헥사 입력 */}
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
                    placeholder="0 0 0 0 FE7FE01FFE7FF03F801 1860801 ..."
                />
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleImportLegacyFnt} style={btnStyle("#6366F1")}>
                        헥사값 DISPLAY
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
