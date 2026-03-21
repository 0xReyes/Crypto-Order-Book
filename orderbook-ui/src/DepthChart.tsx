import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/components/DepthChart.tsx");import * as RefreshRuntime from "/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

let prevRefreshReg;
let prevRefreshSig;

if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react-swc can't detect preamble. Something is wrong."
    );
  }

  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = RefreshRuntime.getRefreshReg("/dev-server/src/components/DepthChart.tsx");
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
}

import { jsxDEV as _jsxDEV, Fragment as _Fragment } from "/@id/__x00__jsx-source/jsx-dev-runtime";
var _s = $RefreshSig$();
import __vite__cjsImport3_react from "/node_modules/.vite/deps/react.js?v=23c3d522"; const useMemo = __vite__cjsImport3_react["useMemo"]; const useEffect = __vite__cjsImport3_react["useEffect"]; const useRef = __vite__cjsImport3_react["useRef"]; const useState = __vite__cjsImport3_react["useState"]; const useCallback = __vite__cjsImport3_react["useCallback"];
import { Slider } from "/src/components/ui/slider.tsx";
import { Button } from "/src/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "/src/components/ui/tooltip.tsx";
import { DepthTable } from "/src/components/depth-chart/DepthTable.tsx";
import { clamp, setupCanvas, niceNum, generateTicks, smartPriceFmt, shortMoney, pctLabel, buildLevels, findBidAtPrice, findAskAtPrice } from "/src/lib/chart-utils.ts";
const PAD = {
    top: 28,
    right: 76,
    bottom: 48,
    left: 76
};
const MIN_X_ZOOM = 0.0000005;
const MAX_X_ZOOM = 5;
const DEFAULT_X_ZOOM = 0.005;
const MIN_Y_ZOOM = 0.05;
const MAX_Y_ZOOM = 200;
const DEFAULT_Y_ZOOM = 1;
const ROW_COUNT = 6;
const xToSlider = (z)=>Math.log(z / MIN_X_ZOOM) / Math.log(MAX_X_ZOOM / MIN_X_ZOOM) * 100;
const sliderToX = (v)=>MIN_X_ZOOM * Math.pow(MAX_X_ZOOM / MIN_X_ZOOM, v / 100);
const yToSlider = (z)=>Math.log(z / MIN_Y_ZOOM) / Math.log(MAX_Y_ZOOM / MIN_Y_ZOOM) * 100;
const sliderToY = (v)=>MIN_Y_ZOOM * Math.pow(MAX_Y_ZOOM / MIN_Y_ZOOM, v / 100);
export default function DepthChart({ data }) {
    _s();
    const plotRef = useRef(null);
    const baseCanvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const dragRef = useRef({
        mode: null,
        startX: 0,
        startY: 0,
        startCenter: 0,
        startXZoom: DEFAULT_X_ZOOM,
        startYZoom: DEFAULT_Y_ZOOM
    });
    const [size, setSize] = useState({
        width: 0,
        height: 0
    });
    const [xZoom, setXZoom] = useState(DEFAULT_X_ZOOM);
    const [yZoom, setYZoom] = useState(DEFAULT_Y_ZOOM);
    const [centerPrice, setCenterPrice] = useState(null);
    const [hover, setHover] = useState(null);
    const [cursorStyle, setCursorStyle] = useState("crosshair");
    const stableBidCeilRef = useRef(0);
    const stableAskCeilRef = useRef(0);
    const fullRange = useMemo(()=>{
        if (!data) return null;
        const bidMin = data.bids.length ? Math.min(...data.bids.map(([p])=>p)) : data.midPrice;
        const askMax = data.asks.length ? Math.max(...data.asks.map(([p])=>p)) : data.midPrice;
        return {
            min: Math.min(bidMin, data.bestBid || data.midPrice, data.midPrice),
            max: Math.max(askMax, Number.isFinite(data.bestAsk) ? data.bestAsk : data.midPrice, data.midPrice)
        };
    }, [
        data
    ]);
    useEffect(()=>{
        if (!data) return;
        setCenterPrice((prev)=>prev == null || !Number.isFinite(prev) ? data.midPrice : prev);
    }, [
        data?.midPrice
    ]);
    const view = useMemo(()=>{
        if (!data || !fullRange) return null;
        const mid = data.midPrice;
        const center = centerPrice ?? mid;
        const half = Math.max(mid * xZoom, mid * MIN_X_ZOOM);
        let minP = center - half;
        let maxP = center + half;
        const fullWidth = fullRange.max - fullRange.min;
        const visibleWidth = maxP - minP;
        if (visibleWidth < fullWidth) {
            if (minP < fullRange.min) {
                maxP += fullRange.min - minP;
                minP = fullRange.min;
            }
            if (maxP > fullRange.max) {
                minP -= maxP - fullRange.max;
                maxP = fullRange.max;
            }
        }
        const bids = buildLevels(data.bids, "bid", minP, maxP);
        const asks = buildLevels(data.asks, "ask", minP, maxP);
        const maxLevelUsd = Math.max(1, ...bids.map((d)=>d.usd), ...asks.map((d)=>d.usd));
        const bidTotal = bids.length ? bids[bids.length - 1].cumUsd : 0;
        const askTotal = asks.length ? asks[asks.length - 1].cumUsd : 0;
        return {
            minP,
            maxP,
            center: (minP + maxP) / 2,
            bids,
            asks,
            bidTotalUsd: bidTotal,
            askTotalUsd: askTotal,
            maxLevelUsd
        };
    }, [
        data,
        fullRange,
        centerPrice,
        xZoom
    ]);
    const spread = useMemo(()=>{
        if (!data || !Number.isFinite(data.bestBid) || !Number.isFinite(data.bestAsk) || data.bestAsk === Infinity) return null;
        return data.bestAsk - data.bestBid;
    }, [
        data
    ]);
    const spreadBps = useMemo(()=>{
        if (spread == null || !data?.midPrice) return null;
        return spread / data.midPrice * 10000;
    }, [
        spread,
        data?.midPrice
    ]);
    const clampCenter = useCallback((nextCenter, nextXZoom)=>{
        if (!data || !fullRange) return nextCenter;
        const half = Math.max(data.midPrice * nextXZoom, data.midPrice * MIN_X_ZOOM);
        const minCenter = fullRange.min + half;
        const maxCenter = fullRange.max - half;
        if (minCenter > maxCenter) return data.midPrice;
        return clamp(nextCenter, minCenter, maxCenter);
    }, [
        data,
        fullRange
    ]);
    /* resize observer */ useEffect(()=>{
        const el = plotRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries)=>{
            const rect = entries[0]?.contentRect;
            if (!rect) return;
            setSize({
                width: Math.floor(rect.width),
                height: Math.floor(rect.height)
            });
        });
        ro.observe(el);
        return ()=>ro.disconnect();
    }, []);
    /* region detection */ const getRegion = useCallback((mx, my)=>{
        const innerW = size.width - PAD.left - PAD.right;
        const innerH = size.height - PAD.top - PAD.bottom;
        if (innerW <= 0 || innerH <= 0) return null;
        const inXBand = mx >= PAD.left && mx <= PAD.left + innerW;
        const inYBand = my >= PAD.top && my <= PAD.top + innerH;
        if (my > PAD.top + innerH && inXBand) return "xaxis";
        if ((mx < PAD.left || mx > PAD.left + innerW) && inYBand) return "yaxis";
        if (inXBand && inYBand) return "chart";
        return null;
    }, [
        size
    ]);
    /* draw base chart */ const drawBase = useCallback(()=>{
        if (!view || !data || !baseCanvasRef.current) return;
        const { width, height } = size;
        if (!width || !height) return;
        const ctx = setupCanvas(baseCanvasRef.current, width, height);
        if (!ctx) return;
        const innerW = width - PAD.left - PAD.right;
        const innerH = height - PAD.top - PAD.bottom;
        if (innerW <= 0 || innerH <= 0) return;
        const xFor = (price)=>PAD.left + (price - view.minP) / (view.maxP - view.minP || 1) * innerW;
        const rawBidCeil = Math.max(view.bidTotalUsd / Math.max(yZoom, 0.0001), 1);
        const rawAskCeil = Math.max(view.askTotalUsd / Math.max(yZoom, 0.0001), 1);
        const computeStableCeil = (raw, prev)=>{
            const niceCeil = niceNum(raw * 1.15, false);
            if (prev <= 0) return niceCeil;
            if (raw > prev || raw < prev * 0.4) return niceCeil;
            return prev;
        };
        stableBidCeilRef.current = computeStableCeil(rawBidCeil, stableBidCeilRef.current);
        stableAskCeilRef.current = computeStableCeil(rawAskCeil, stableAskCeilRef.current);
        const bidCeil = stableBidCeilRef.current;
        const askCeil = stableAskCeilRef.current;
        const bidYFor = (usd)=>PAD.top + innerH - usd / bidCeil * innerH;
        const askYFor = (usd)=>PAD.top + innerH - usd / askCeil * innerH;
        ctx.fillStyle = "rgba(2, 11, 20, 0.55)";
        ctx.fillRect(0, 0, width, height);
        const priceRange = view.maxP - view.minP;
        const xTicks = generateTicks(view.minP, view.maxP, 7);
        const yTicksBid = generateTicks(0, bidCeil, 5);
        const yTicksAsk = generateTicks(0, askCeil, 5);
        // X gridlines
        for (const tick of xTicks){
            const x = xFor(tick);
            if (x < PAD.left || x > PAD.left + innerW) continue;
            ctx.strokeStyle = "rgba(255,255,255,0.05)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, PAD.top);
            ctx.lineTo(x, PAD.top + innerH);
            ctx.stroke();
        }
        // Y gridlines
        for (const tick of yTicksBid){
            const y = bidYFor(tick);
            if (y < PAD.top || y > PAD.top + innerH) continue;
            ctx.setLineDash([
                2,
                6
            ]);
            ctx.strokeStyle = "rgba(255,255,255,0.04)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(PAD.left + innerW, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // Bid Y-axis labels (left)
        ctx.font = '600 10px "IBM Plex Mono", monospace';
        ctx.textAlign = "right";
        for (const tick of yTicksBid){
            const y = bidYFor(tick);
            if (y < PAD.top + 2 || y > PAD.top + innerH - 2) continue;
            ctx.fillStyle = "rgba(0,255,153,0.5)";
            ctx.fillText(shortMoney(tick), PAD.left - 10, y + 3);
        }
        // Ask Y-axis labels (right)
        ctx.textAlign = "left";
        for (const tick of yTicksAsk){
            const y = askYFor(tick);
            if (y < PAD.top + 2 || y > PAD.top + innerH - 2) continue;
            ctx.fillStyle = "rgba(255,61,113,0.5)";
            ctx.fillText(shortMoney(tick), PAD.left + innerW + 10, y + 3);
        }
        // Individual-level bars
        const barMaxH = innerH * 0.18;
        for(let i = 0; i < view.bids.length; i++){
            const level = view.bids[i];
            const nextP = i + 1 < view.bids.length ? view.bids[i + 1].p : view.minP;
            const x1 = xFor(nextP);
            const x2 = xFor(level.p);
            const barH = level.usd / view.maxLevelUsd * barMaxH;
            ctx.fillStyle = "rgba(0, 255, 153, 0.14)";
            ctx.fillRect(x1, PAD.top + innerH - barH, Math.max(1, x2 - x1 - 1), barH);
        }
        for(let i = 0; i < view.asks.length; i++){
            const level = view.asks[i];
            const nextP = i + 1 < view.asks.length ? view.asks[i + 1].p : view.maxP;
            const x1 = xFor(level.p);
            const x2 = xFor(nextP);
            const barH = level.usd / view.maxLevelUsd * barMaxH;
            ctx.fillStyle = "rgba(255, 61, 113, 0.14)";
            ctx.fillRect(x1, PAD.top + innerH - barH, Math.max(1, x2 - x1 - 1), barH);
        }
        // Cumulative depth curves
        const drawDepth = (levels, side)=>{
            if (!levels.length) return;
            const isBid = side === "bid";
            const sideYFor = isBid ? bidYFor : askYFor;
            const lineColor = isBid ? "rgba(0,255,153,0.96)" : "rgba(255,61,113,0.96)";
            const topFill = isBid ? "rgba(0,255,153,0.16)" : "rgba(255,61,113,0.16)";
            const bottomFill = isBid ? "rgba(0,255,153,0.02)" : "rgba(255,61,113,0.02)";
            const path = new Path2D();
            path.moveTo(xFor(data.midPrice), sideYFor(0));
            path.lineTo(xFor(levels[0].p), sideYFor(0));
            for(let i = 0; i < levels.length; i++){
                const prev = i === 0 ? 0 : levels[i - 1].cumUsd;
                path.lineTo(xFor(levels[i].p), sideYFor(prev));
                path.lineTo(xFor(levels[i].p), sideYFor(levels[i].cumUsd));
            }
            const fill = new Path2D(path);
            fill.lineTo(xFor(levels[levels.length - 1].p), sideYFor(0));
            fill.lineTo(xFor(data.midPrice), sideYFor(0));
            fill.closePath();
            const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + innerH);
            grad.addColorStop(0, topFill);
            grad.addColorStop(1, bottomFill);
            ctx.fillStyle = grad;
            ctx.fill(fill);
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2;
            ctx.stroke(path);
        };
        drawDepth(view.bids, "bid");
        drawDepth(view.asks, "ask");
        // Crossed market overlay
        if (data.isCrossed) {
            const x1 = Math.max(PAD.left, xFor(data.bestAsk));
            const x2 = Math.min(PAD.left + innerW, xFor(data.bestBid));
            if (x2 > x1) {
                ctx.fillStyle = "rgba(255, 184, 0, 0.08)";
                ctx.fillRect(x1, PAD.top, x2 - x1, innerH);
                ctx.strokeStyle = "rgba(255, 184, 0, 0.16)";
                ctx.setLineDash([
                    3,
                    4
                ]);
                ctx.beginPath();
                ctx.moveTo(x1, PAD.top);
                ctx.lineTo(x1, PAD.top + innerH);
                ctx.moveTo(x2, PAD.top);
                ctx.lineTo(x2, PAD.top + innerH);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        // Mid price line
        const midX = xFor(data.midPrice);
        ctx.setLineDash([
            3,
            5
        ]);
        ctx.strokeStyle = "rgba(79, 172, 255, 0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX, PAD.top);
        ctx.lineTo(midX, PAD.top + innerH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(80, 174, 255, 1)";
        ctx.font = '700 11px "IBM Plex Mono", monospace';
        ctx.textAlign = "center";
        ctx.fillText(data.midPrice.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }), midX, PAD.top - 8);
        if (data.isCrossed) {
            ctx.fillStyle = "rgba(255, 184, 0, 0.95)";
            ctx.font = '700 10px "IBM Plex Mono", monospace';
            ctx.fillText("CROSSED", midX, PAD.top + 14);
        }
        // Side labels
        ctx.fillStyle = "rgba(0,255,153,0.95)";
        ctx.textAlign = "left";
        ctx.font = '700 12px "IBM Plex Mono", monospace';
        ctx.fillText("BIDS", PAD.left + 4, PAD.top + 14);
        ctx.fillStyle = "rgba(255,61,113,0.95)";
        ctx.textAlign = "right";
        ctx.fillText("ASKS", PAD.left + innerW - 4, PAD.top + 14);
        // Chart border
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(PAD.left, PAD.top, innerW, innerH);
        ctx.stroke();
        // X-axis ticks + labels
        const axisY = PAD.top + innerH;
        ctx.fillStyle = "rgba(148,163,184,0.78)";
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        for (const tick of xTicks){
            const x = xFor(tick);
            if (x < PAD.left - 2 || x > PAD.left + innerW + 2) continue;
            ctx.beginPath();
            ctx.moveTo(x, axisY);
            ctx.lineTo(x, axisY + 6);
            ctx.stroke();
            ctx.fillText(smartPriceFmt(tick, priceRange), x, axisY + 20);
        }
        ctx.fillStyle = "rgba(148,163,184,0.55)";
        ctx.font = '700 10px "IBM Plex Mono", monospace';
        ctx.textAlign = "center";
        ctx.fillText("PRICE", PAD.left + innerW / 2, axisY + 32);
    }, [
        view,
        data,
        size,
        yZoom
    ]);
    /* draw overlay */ const drawOverlay = useCallback(()=>{
        if (!overlayCanvasRef.current) return;
        const { width, height } = size;
        if (!width || !height) return;
        const ctx = setupCanvas(overlayCanvasRef.current, width, height);
        if (!ctx || !view || !hover) return;
        const innerW = width - PAD.left - PAD.right;
        const innerH = height - PAD.top - PAD.bottom;
        const xFor = (price)=>PAD.left + (price - view.minP) / (view.maxP - view.minP || 1) * innerW;
        const bidCeil = stableBidCeilRef.current || Math.max(view.bidTotalUsd / Math.max(yZoom, 0.0001), 1) * 1.15;
        const askCeil = stableAskCeilRef.current || Math.max(view.askTotalUsd / Math.max(yZoom, 0.0001), 1) * 1.15;
        const bidYFor = (usd)=>PAD.top + innerH - usd / bidCeil * innerH;
        const askYFor = (usd)=>PAD.top + innerH - usd / askCeil * innerH;
        ctx.setLineDash([
            3,
            5
        ]);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hover.mouseX, PAD.top);
        ctx.lineTo(hover.mouseX, PAD.top + innerH);
        ctx.stroke();
        ctx.setLineDash([]);
        if (hover.bid) {
            const x = xFor(hover.bid.p);
            const y = bidYFor(hover.bid.cumUsd);
            ctx.strokeStyle = "rgba(0,255,153,0.18)";
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(PAD.left + innerW, y);
            ctx.stroke();
            ctx.fillStyle = "rgba(0,255,153,1)";
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
        if (hover.ask) {
            const x = xFor(hover.ask.p);
            const y = askYFor(hover.ask.cumUsd);
            ctx.strokeStyle = "rgba(255,61,113,0.18)";
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(PAD.left + innerW, y);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,61,113,1)";
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }, [
        size,
        view,
        hover,
        yZoom
    ]);
    useEffect(()=>{
        drawBase();
    }, [
        drawBase
    ]);
    useEffect(()=>{
        drawOverlay();
    }, [
        drawOverlay
    ]);
    /* mouse handlers */ const canvasRectRef = useRef(null);
    const handleWindowDrag = useCallback((e)=>{
        if (!view || !canvasRectRef.current) return;
        const rect = canvasRectRef.current;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const { mode } = dragRef.current;
        if (mode === "xaxis") {
            const delta = mx - dragRef.current.startX;
            const newZoom = clamp(dragRef.current.startXZoom * Math.pow(2, delta / 120), MIN_X_ZOOM, MAX_X_ZOOM);
            setXZoom(newZoom);
            setCenterPrice(clampCenter(dragRef.current.startCenter, newZoom));
            stableBidCeilRef.current = 0;
            stableAskCeilRef.current = 0;
            setCursorStyle("ew-resize");
            setHover(null);
            return;
        }
        if (mode === "yaxis") {
            const delta = my - dragRef.current.startY;
            const newZoom = clamp(dragRef.current.startYZoom * Math.pow(2, -delta / 120), MIN_Y_ZOOM, MAX_Y_ZOOM);
            setYZoom(newZoom);
            stableBidCeilRef.current = 0;
            stableAskCeilRef.current = 0;
            setCursorStyle("ns-resize");
            setHover(null);
            return;
        }
        if (mode === "pan") {
            const innerW = size.width - PAD.left - PAD.right;
            if (innerW > 0) {
                const pricePerPx = (view.maxP - view.minP) / innerW;
                const deltaPx = mx - dragRef.current.startX;
                setCenterPrice(clampCenter(dragRef.current.startCenter - deltaPx * pricePerPx, xZoom));
            }
            setCursorStyle("grabbing");
        }
    }, [
        view,
        size,
        xZoom,
        clampCenter
    ]);
    const handleMouseDown = useCallback((e)=>{
        const rect = e.currentTarget.getBoundingClientRect();
        canvasRectRef.current = rect;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const region = getRegion(mx, my);
        if (region === "xaxis" || region === "yaxis" || region === "chart") {
            dragRef.current = {
                mode: region === "chart" ? "pan" : region,
                startX: mx,
                startY: my,
                startCenter: centerPrice ?? data?.midPrice ?? 0,
                startXZoom: xZoom,
                startYZoom: yZoom
            };
            window.addEventListener("mousemove", handleWindowDrag);
        }
    }, [
        getRegion,
        centerPrice,
        data?.midPrice,
        xZoom,
        yZoom,
        handleWindowDrag
    ]);
    const handleCanvasHover = useCallback((e)=>{
        if (!view) return;
        const { mode } = dragRef.current;
        if (mode) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const innerW = size.width - PAD.left - PAD.right;
        const region = getRegion(mx, my);
        if (region === "xaxis") setCursorStyle("ew-resize");
        else if (region === "yaxis") setCursorStyle("ns-resize");
        else setCursorStyle("crosshair");
        if (region === "chart") {
            const price = view.minP + (mx - PAD.left) / innerW * (view.maxP - view.minP);
            setHover({
                clientX: e.clientX,
                clientY: e.clientY,
                mouseX: mx,
                mouseY: my,
                price,
                bid: findBidAtPrice(view.bids, price),
                ask: findAskAtPrice(view.asks, price)
            });
        } else {
            setHover(null);
        }
    }, [
        view,
        size,
        getRegion
    ]);
    const stopDragging = useCallback(()=>{
        dragRef.current.mode = null;
        setCursorStyle("crosshair");
        window.removeEventListener("mousemove", handleWindowDrag);
    }, [
        handleWindowDrag
    ]);
    useEffect(()=>{
        window.addEventListener("mouseup", stopDragging);
        return ()=>{
            window.removeEventListener("mouseup", stopDragging);
            window.removeEventListener("mousemove", handleWindowDrag);
        };
    }, [
        stopDragging,
        handleWindowDrag
    ]);
    const resetView = useCallback(()=>{
        if (!data) return;
        setXZoom(DEFAULT_X_ZOOM);
        setYZoom(DEFAULT_Y_ZOOM);
        setCenterPrice(data.midPrice);
        stableBidCeilRef.current = 0;
        stableAskCeilRef.current = 0;
    }, [
        data
    ]);
    const handleXSlider = useCallback((val)=>{
        const next = sliderToX(val[0]);
        setXZoom(next);
        stableBidCeilRef.current = 0;
        stableAskCeilRef.current = 0;
        if (data) setCenterPrice(clampCenter(centerPrice ?? data.midPrice, next));
    }, [
        data,
        centerPrice,
        clampCenter
    ]);
    const handleYSlider = useCallback((val)=>{
        setYZoom(sliderToY(val[0]));
        stableBidCeilRef.current = 0;
        stableAskCeilRef.current = 0;
    }, []);
    const displayBids = useMemo(()=>(view?.bids ?? []).slice(0, ROW_COUNT), [
        view?.bids
    ]);
    const displayAsks = useMemo(()=>(view?.asks ?? []).slice(0, ROW_COUNT), [
        view?.asks
    ]);
    return /*#__PURE__*/ _jsxDEV(TooltipProvider, {
        delayDuration: 200,
        children: /*#__PURE__*/ _jsxDEV("div", {
            className: "cg-glass overflow-hidden rounded-none text-white",
            style: {
                gridColumn: "1 / -1"
            },
            children: [
                /*#__PURE__*/ _jsxDEV("div", {
                    className: "border-b border-white/10 bg-white/[0.03] px-4 py-3",
                    children: /*#__PURE__*/ _jsxDEV("div", {
                        className: "flex items-start justify-between gap-4 flex-wrap",
                        children: [
                            /*#__PURE__*/ _jsxDEV("div", {
                                className: "flex flex-wrap items-center gap-6",
                                children: [
                                    /*#__PURE__*/ _jsxDEV("div", {
                                        children: /*#__PURE__*/ _jsxDEV("div", {
                                            className: "text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500",
                                            children: "Depth Chart"
                                        }, void 0, false, {
                                            fileName: "/dev-server/src/components/DepthChart.tsx",
                                            lineNumber: 598,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "/dev-server/src/components/DepthChart.tsx",
                                        lineNumber: 597,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ _jsxDEV("div", {
                                        children: [
                                            /*#__PURE__*/ _jsxDEV("div", {
                                                className: "text-[11px] uppercase tracking-[0.18em] text-slate-500",
                                                children: [
                                                    "Bids ",
                                                    view ? `-${pctLabel(xZoom)}` : ""
                                                ]
                                            }, void 0, true, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 601,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ _jsxDEV("div", {
                                                className: "font-mono text-[14px] font-semibold text-emerald-400",
                                                children: shortMoney(view?.bidTotalUsd ?? 0)
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 602,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "/dev-server/src/components/DepthChart.tsx",
                                        lineNumber: 600,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ _jsxDEV("div", {
                                        children: [
                                            /*#__PURE__*/ _jsxDEV("div", {
                                                className: "text-[11px] uppercase tracking-[0.18em] text-slate-500",
                                                children: [
                                                    "Asks ",
                                                    view ? `+${pctLabel(xZoom)}` : ""
                                                ]
                                            }, void 0, true, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 605,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ _jsxDEV("div", {
                                                className: "font-mono text-[14px] font-semibold text-rose-400",
                                                children: shortMoney(view?.askTotalUsd ?? 0)
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 606,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "/dev-server/src/components/DepthChart.tsx",
                                        lineNumber: 604,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ _jsxDEV("div", {
                                        children: [
                                            /*#__PURE__*/ _jsxDEV("div", {
                                                className: "text-[11px] uppercase tracking-[0.18em] text-slate-500",
                                                children: "Spread"
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 609,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ _jsxDEV("div", {
                                                className: "font-mono text-[14px] font-semibold text-slate-100",
                                                children: spread != null ? `${spread.toLocaleString(undefined, {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2
                                                })}${spreadBps != null ? ` • ${spreadBps.toFixed(1)} bps` : ""}` : "—"
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 610,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "/dev-server/src/components/DepthChart.tsx",
                                        lineNumber: 608,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                lineNumber: 596,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ _jsxDEV("div", {
                                className: "flex items-center gap-4 flex-wrap",
                                children: [
                                    /*#__PURE__*/ _jsxDEV(Tooltip, {
                                        children: [
                                            /*#__PURE__*/ _jsxDEV(TooltipTrigger, {
                                                asChild: true,
                                                children: /*#__PURE__*/ _jsxDEV("div", {
                                                    className: "flex items-center gap-2.5",
                                                    children: [
                                                        /*#__PURE__*/ _jsxDEV("span", {
                                                            className: "text-[11px] uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap",
                                                            children: "X Range"
                                                        }, void 0, false, {
                                                            fileName: "/dev-server/src/components/DepthChart.tsx",
                                                            lineNumber: 622,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ _jsxDEV(Slider, {
                                                            value: [
                                                                xToSlider(xZoom)
                                                            ],
                                                            onValueChange: handleXSlider,
                                                            min: 0,
                                                            max: 100,
                                                            step: 0.5,
                                                            className: "w-24"
                                                        }, void 0, false, {
                                                            fileName: "/dev-server/src/components/DepthChart.tsx",
                                                            lineNumber: 623,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ _jsxDEV("span", {
                                                            className: "font-mono text-[11px] text-slate-300 min-w-[48px] text-right",
                                                            children: pctLabel(xZoom)
                                                        }, void 0, false, {
                                                            fileName: "/dev-server/src/components/DepthChart.tsx",
                                                            lineNumber: 624,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                                    lineNumber: 621,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 620,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ _jsxDEV(TooltipContent, {
                                                side: "bottom",
                                                className: "text-xs",
                                                children: "Price range around mid · drag X axis to zoom"
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 627,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "/dev-server/src/components/DepthChart.tsx",
                                        lineNumber: 619,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ _jsxDEV(Tooltip, {
                                        children: [
                                            /*#__PURE__*/ _jsxDEV(TooltipTrigger, {
                                                asChild: true,
                                                children: /*#__PURE__*/ _jsxDEV("div", {
                                                    className: "flex items-center gap-2.5",
                                                    children: [
                                                        /*#__PURE__*/ _jsxDEV("span", {
                                                            className: "text-[11px] uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap",
                                                            children: "Y Scale"
                                                        }, void 0, false, {
                                                            fileName: "/dev-server/src/components/DepthChart.tsx",
                                                            lineNumber: 633,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ _jsxDEV(Slider, {
                                                            value: [
                                                                yToSlider(yZoom)
                                                            ],
                                                            onValueChange: handleYSlider,
                                                            min: 0,
                                                            max: 100,
                                                            step: 0.5,
                                                            className: "w-24"
                                                        }, void 0, false, {
                                                            fileName: "/dev-server/src/components/DepthChart.tsx",
                                                            lineNumber: 634,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ _jsxDEV("span", {
                                                            className: "font-mono text-[11px] text-slate-300 min-w-[36px] text-right",
                                                            children: [
                                                                yZoom.toFixed(1),
                                                                "×"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "/dev-server/src/components/DepthChart.tsx",
                                                            lineNumber: 635,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                                    lineNumber: 632,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 631,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ _jsxDEV(TooltipContent, {
                                                side: "bottom",
                                                className: "text-xs",
                                                children: "Value axis scale · drag Y axis to zoom"
                                            }, void 0, false, {
                                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                                lineNumber: 638,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "/dev-server/src/components/DepthChart.tsx",
                                        lineNumber: 630,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ _jsxDEV(Button, {
                                        onClick: resetView,
                                        className: "rounded-md border border-white/6 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono font-semibold text-slate-400 transition hover:border-white/12 hover:text-slate-200",
                                        children: "RESET"
                                    }, void 0, false, {
                                        fileName: "/dev-server/src/components/DepthChart.tsx",
                                        lineNumber: 641,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                lineNumber: 618,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "/dev-server/src/components/DepthChart.tsx",
                        lineNumber: 595,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "/dev-server/src/components/DepthChart.tsx",
                    lineNumber: 594,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ _jsxDEV("div", {
                    ref: plotRef,
                    className: "relative w-full select-none border-b border-white/10 bg-transparent",
                    style: {
                        height: "clamp(260px, 36vh, 440px)"
                    },
                    children: !view ? /*#__PURE__*/ _jsxDEV("div", {
                        className: "absolute inset-0 grid place-items-center text-sm text-slate-500",
                        children: "No depth data"
                    }, void 0, false, {
                        fileName: "/dev-server/src/components/DepthChart.tsx",
                        lineNumber: 658,
                        columnNumber: 13
                    }, this) : /*#__PURE__*/ _jsxDEV(_Fragment, {
                        children: [
                            /*#__PURE__*/ _jsxDEV("canvas", {
                                ref: baseCanvasRef,
                                className: "absolute inset-0 block"
                            }, void 0, false, {
                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                lineNumber: 661,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ _jsxDEV("canvas", {
                                ref: overlayCanvasRef,
                                className: "absolute inset-0 block",
                                style: {
                                    cursor: cursorStyle,
                                    touchAction: "none"
                                },
                                onMouseMove: handleCanvasHover,
                                onMouseLeave: ()=>{
                                    if (!dragRef.current.mode) {
                                        setHover(null);
                                        setCursorStyle("crosshair");
                                    }
                                },
                                onMouseDown: handleMouseDown
                            }, void 0, false, {
                                fileName: "/dev-server/src/components/DepthChart.tsx",
                                lineNumber: 662,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true)
                }, void 0, false, {
                    fileName: "/dev-server/src/components/DepthChart.tsx",
                    lineNumber: 652,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ _jsxDEV("div", {
                    className: "grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-2 lg:divide-x lg:divide-y-0",
                    children: [
                        /*#__PURE__*/ _jsxDEV(DepthTable, {
                            title: "Bids",
                            tone: "bid",
                            rows: displayBids
                        }, void 0, false, {
                            fileName: "/dev-server/src/components/DepthChart.tsx",
                            lineNumber: 681,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ _jsxDEV(DepthTable, {
                            title: "Asks",
                            tone: "ask",
                            rows: displayAsks
                        }, void 0, false, {
                            fileName: "/dev-server/src/components/DepthChart.tsx",
                            lineNumber: 682,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "/dev-server/src/components/DepthChart.tsx",
                    lineNumber: 680,
                    columnNumber: 9
                }, this),
                hover && /*#__PURE__*/ _jsxDEV("div", {
                    className: "pointer-events-none fixed z-[200] min-w-[230px] rounded-md border border-white/12 bg-card/55 px-3 py-2 text-[11px] shadow-2xl backdrop-blur-2xl",
                    style: {
                        left: hover.clientX + 250 > window.innerWidth ? hover.clientX - 240 : hover.clientX + 14,
                        top: Math.min(hover.clientY - 10, window.innerHeight - 170)
                    },
                    children: [
                        /*#__PURE__*/ _jsxDEV("div", {
                            className: "mb-2 font-mono text-[13px] font-bold text-white",
                            children: hover.price.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })
                        }, void 0, false, {
                            fileName: "/dev-server/src/components/DepthChart.tsx",
                            lineNumber: 694,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ _jsxDEV("div", {
                            className: "flex justify-between gap-6 py-0.5",
                            children: [
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "text-slate-500",
                                    children: "Bid Value"
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 698,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "font-mono text-emerald-400",
                                    children: shortMoney(hover.bid?.usd ?? 0)
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 699,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "/dev-server/src/components/DepthChart.tsx",
                            lineNumber: 697,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ _jsxDEV("div", {
                            className: "flex justify-between gap-6 py-0.5",
                            children: [
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "text-slate-500",
                                    children: "Bid Total"
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 702,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "font-mono text-emerald-400",
                                    children: shortMoney(hover.bid?.cumUsd ?? 0)
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 703,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "/dev-server/src/components/DepthChart.tsx",
                            lineNumber: 701,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ _jsxDEV("div", {
                            className: "flex justify-between gap-6 py-0.5",
                            children: [
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "text-slate-500",
                                    children: "Ask Value"
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 706,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "font-mono text-rose-400",
                                    children: shortMoney(hover.ask?.usd ?? 0)
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 707,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "/dev-server/src/components/DepthChart.tsx",
                            lineNumber: 705,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ _jsxDEV("div", {
                            className: "flex justify-between gap-6 py-0.5",
                            children: [
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "text-slate-500",
                                    children: "Ask Total"
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 710,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ _jsxDEV("span", {
                                    className: "font-mono text-rose-400",
                                    children: shortMoney(hover.ask?.cumUsd ?? 0)
                                }, void 0, false, {
                                    fileName: "/dev-server/src/components/DepthChart.tsx",
                                    lineNumber: 711,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "/dev-server/src/components/DepthChart.tsx",
                            lineNumber: 709,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "/dev-server/src/components/DepthChart.tsx",
                    lineNumber: 687,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "/dev-server/src/components/DepthChart.tsx",
            lineNumber: 592,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "/dev-server/src/components/DepthChart.tsx",
        lineNumber: 591,
        columnNumber: 5
    }, this);
}
_s(DepthChart, "S7jcbtAcZ9JNK2Csh2ai5WPGP9I=");
_c = DepthChart;
var _c;
$RefreshReg$(_c, "DepthChart");


if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}


if (import.meta.hot && !inWebWorker) {
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("/dev-server/src/components/DepthChart.tsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("/dev-server/src/components/DepthChart.tsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlcHRoQ2hhcnQudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHVzZU1lbW8sIHVzZUVmZmVjdCwgdXNlUmVmLCB1c2VTdGF0ZSwgdXNlQ2FsbGJhY2sgfSBmcm9tIFwicmVhY3RcIjtcbmltcG9ydCB7IFNsaWRlciB9IGZyb20gXCJAL2NvbXBvbmVudHMvdWkvc2xpZGVyXCI7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tIFwiQC9jb21wb25lbnRzL3VpL2J1dHRvblwiO1xuaW1wb3J0IHsgVG9vbHRpcCwgVG9vbHRpcENvbnRlbnQsIFRvb2x0aXBUcmlnZ2VyLCBUb29sdGlwUHJvdmlkZXIgfSBmcm9tIFwiQC9jb21wb25lbnRzL3VpL3Rvb2x0aXBcIjtcbmltcG9ydCB7IERlcHRoVGFibGUgfSBmcm9tIFwiQC9jb21wb25lbnRzL2RlcHRoLWNoYXJ0L0RlcHRoVGFibGVcIjtcbmltcG9ydCB0eXBlIHsgUHJvY2Vzc2VkQm9vayB9IGZyb20gXCJAL3R5cGVzL29yZGVyYm9va1wiO1xuaW1wb3J0IHtcbiAgY2xhbXAsIHNldHVwQ2FudmFzLCBuaWNlTnVtLCBnZW5lcmF0ZVRpY2tzLCBzbWFydFByaWNlRm10LFxuICBzaG9ydE1vbmV5LCBwY3RMYWJlbCwgYnVpbGRMZXZlbHMsIGZpbmRCaWRBdFByaWNlLCBmaW5kQXNrQXRQcmljZSxcbiAgdHlwZSBMZXZlbFBvaW50LFxufSBmcm9tIFwiQC9saWIvY2hhcnQtdXRpbHNcIjtcblxudHlwZSBIb3ZlclN0YXRlID0ge1xuICBjbGllbnRYOiBudW1iZXI7XG4gIGNsaWVudFk6IG51bWJlcjtcbiAgbW91c2VYOiBudW1iZXI7XG4gIG1vdXNlWTogbnVtYmVyO1xuICBwcmljZTogbnVtYmVyO1xuICBiaWQ6IExldmVsUG9pbnQgfCBudWxsO1xuICBhc2s6IExldmVsUG9pbnQgfCBudWxsO1xufTtcblxudHlwZSBWaWV3U3RhdGUgPSB7XG4gIG1pblA6IG51bWJlcjtcbiAgbWF4UDogbnVtYmVyO1xuICBjZW50ZXI6IG51bWJlcjtcbiAgYmlkVG90YWxVc2Q6IG51bWJlcjtcbiAgYXNrVG90YWxVc2Q6IG51bWJlcjtcbiAgbWF4TGV2ZWxVc2Q6IG51bWJlcjtcbiAgYmlkczogTGV2ZWxQb2ludFtdO1xuICBhc2tzOiBMZXZlbFBvaW50W107XG59O1xuXG50eXBlIERyYWdNb2RlID0gXCJwYW5cIiB8IFwieGF4aXNcIiB8IFwieWF4aXNcIiB8IG51bGw7XG5cbmNvbnN0IFBBRCA9IHsgdG9wOiAyOCwgcmlnaHQ6IDc2LCBib3R0b206IDQ4LCBsZWZ0OiA3NiB9O1xuY29uc3QgTUlOX1hfWk9PTSA9IDAuMDAwMDAwNTtcbmNvbnN0IE1BWF9YX1pPT00gPSA1O1xuY29uc3QgREVGQVVMVF9YX1pPT00gPSAwLjAwNTtcbmNvbnN0IE1JTl9ZX1pPT00gPSAwLjA1O1xuY29uc3QgTUFYX1lfWk9PTSA9IDIwMDtcbmNvbnN0IERFRkFVTFRfWV9aT09NID0gMTtcbmNvbnN0IFJPV19DT1VOVCA9IDY7XG5cbmNvbnN0IHhUb1NsaWRlciA9ICh6OiBudW1iZXIpID0+XG4gIChNYXRoLmxvZyh6IC8gTUlOX1hfWk9PTSkgLyBNYXRoLmxvZyhNQVhfWF9aT09NIC8gTUlOX1hfWk9PTSkpICogMTAwO1xuY29uc3Qgc2xpZGVyVG9YID0gKHY6IG51bWJlcikgPT5cbiAgTUlOX1hfWk9PTSAqIE1hdGgucG93KE1BWF9YX1pPT00gLyBNSU5fWF9aT09NLCB2IC8gMTAwKTtcbmNvbnN0IHlUb1NsaWRlciA9ICh6OiBudW1iZXIpID0+XG4gIChNYXRoLmxvZyh6IC8gTUlOX1lfWk9PTSkgLyBNYXRoLmxvZyhNQVhfWV9aT09NIC8gTUlOX1lfWk9PTSkpICogMTAwO1xuY29uc3Qgc2xpZGVyVG9ZID0gKHY6IG51bWJlcikgPT5cbiAgTUlOX1lfWk9PTSAqIE1hdGgucG93KE1BWF9ZX1pPT00gLyBNSU5fWV9aT09NLCB2IC8gMTAwKTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gRGVwdGhDaGFydCh7IGRhdGEgfTogeyBkYXRhOiBQcm9jZXNzZWRCb29rIHwgdW5kZWZpbmVkIH0pIHtcbiAgY29uc3QgcGxvdFJlZiA9IHVzZVJlZjxIVE1MRGl2RWxlbWVudD4obnVsbCk7XG4gIGNvbnN0IGJhc2VDYW52YXNSZWYgPSB1c2VSZWY8SFRNTENhbnZhc0VsZW1lbnQ+KG51bGwpO1xuICBjb25zdCBvdmVybGF5Q2FudmFzUmVmID0gdXNlUmVmPEhUTUxDYW52YXNFbGVtZW50PihudWxsKTtcblxuICBjb25zdCBkcmFnUmVmID0gdXNlUmVmPHtcbiAgICBtb2RlOiBEcmFnTW9kZTtcbiAgICBzdGFydFg6IG51bWJlcjtcbiAgICBzdGFydFk6IG51bWJlcjtcbiAgICBzdGFydENlbnRlcjogbnVtYmVyO1xuICAgIHN0YXJ0WFpvb206IG51bWJlcjtcbiAgICBzdGFydFlab29tOiBudW1iZXI7XG4gIH0+KHsgbW9kZTogbnVsbCwgc3RhcnRYOiAwLCBzdGFydFk6IDAsIHN0YXJ0Q2VudGVyOiAwLCBzdGFydFhab29tOiBERUZBVUxUX1hfWk9PTSwgc3RhcnRZWm9vbTogREVGQVVMVF9ZX1pPT00gfSk7XG5cbiAgY29uc3QgW3NpemUsIHNldFNpemVdID0gdXNlU3RhdGUoeyB3aWR0aDogMCwgaGVpZ2h0OiAwIH0pO1xuICBjb25zdCBbeFpvb20sIHNldFhab29tXSA9IHVzZVN0YXRlKERFRkFVTFRfWF9aT09NKTtcbiAgY29uc3QgW3lab29tLCBzZXRZWm9vbV0gPSB1c2VTdGF0ZShERUZBVUxUX1lfWk9PTSk7XG4gIGNvbnN0IFtjZW50ZXJQcmljZSwgc2V0Q2VudGVyUHJpY2VdID0gdXNlU3RhdGU8bnVtYmVyIHwgbnVsbD4obnVsbCk7XG4gIGNvbnN0IFtob3Zlciwgc2V0SG92ZXJdID0gdXNlU3RhdGU8SG92ZXJTdGF0ZSB8IG51bGw+KG51bGwpO1xuICBjb25zdCBbY3Vyc29yU3R5bGUsIHNldEN1cnNvclN0eWxlXSA9IHVzZVN0YXRlKFwiY3Jvc3NoYWlyXCIpO1xuXG4gIGNvbnN0IHN0YWJsZUJpZENlaWxSZWYgPSB1c2VSZWYoMCk7XG4gIGNvbnN0IHN0YWJsZUFza0NlaWxSZWYgPSB1c2VSZWYoMCk7XG5cbiAgY29uc3QgZnVsbFJhbmdlID0gdXNlTWVtbygoKSA9PiB7XG4gICAgaWYgKCFkYXRhKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBiaWRNaW4gPSBkYXRhLmJpZHMubGVuZ3RoID8gTWF0aC5taW4oLi4uZGF0YS5iaWRzLm1hcCgoW3BdKSA9PiBwKSkgOiBkYXRhLm1pZFByaWNlO1xuICAgIGNvbnN0IGFza01heCA9IGRhdGEuYXNrcy5sZW5ndGggPyBNYXRoLm1heCguLi5kYXRhLmFza3MubWFwKChbcF0pID0+IHApKSA6IGRhdGEubWlkUHJpY2U7XG4gICAgcmV0dXJuIHtcbiAgICAgIG1pbjogTWF0aC5taW4oYmlkTWluLCBkYXRhLmJlc3RCaWQgfHwgZGF0YS5taWRQcmljZSwgZGF0YS5taWRQcmljZSksXG4gICAgICBtYXg6IE1hdGgubWF4KGFza01heCwgTnVtYmVyLmlzRmluaXRlKGRhdGEuYmVzdEFzaykgPyBkYXRhLmJlc3RBc2sgOiBkYXRhLm1pZFByaWNlLCBkYXRhLm1pZFByaWNlKSxcbiAgICB9O1xuICB9LCBbZGF0YV0pO1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCFkYXRhKSByZXR1cm47XG4gICAgc2V0Q2VudGVyUHJpY2UoKHByZXYpID0+IChwcmV2ID09IG51bGwgfHwgIU51bWJlci5pc0Zpbml0ZShwcmV2KSA/IGRhdGEubWlkUHJpY2UgOiBwcmV2KSk7XG4gIH0sIFtkYXRhPy5taWRQcmljZV0pO1xuXG4gIGNvbnN0IHZpZXcgPSB1c2VNZW1vPFZpZXdTdGF0ZSB8IG51bGw+KCgpID0+IHtcbiAgICBpZiAoIWRhdGEgfHwgIWZ1bGxSYW5nZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgbWlkID0gZGF0YS5taWRQcmljZTtcbiAgICBjb25zdCBjZW50ZXIgPSBjZW50ZXJQcmljZSA/PyBtaWQ7XG4gICAgY29uc3QgaGFsZiA9IE1hdGgubWF4KG1pZCAqIHhab29tLCBtaWQgKiBNSU5fWF9aT09NKTtcbiAgICBsZXQgbWluUCA9IGNlbnRlciAtIGhhbGY7XG4gICAgbGV0IG1heFAgPSBjZW50ZXIgKyBoYWxmO1xuICAgIGNvbnN0IGZ1bGxXaWR0aCA9IGZ1bGxSYW5nZS5tYXggLSBmdWxsUmFuZ2UubWluO1xuICAgIGNvbnN0IHZpc2libGVXaWR0aCA9IG1heFAgLSBtaW5QO1xuICAgIGlmICh2aXNpYmxlV2lkdGggPCBmdWxsV2lkdGgpIHtcbiAgICAgIGlmIChtaW5QIDwgZnVsbFJhbmdlLm1pbikgeyBtYXhQICs9IGZ1bGxSYW5nZS5taW4gLSBtaW5QOyBtaW5QID0gZnVsbFJhbmdlLm1pbjsgfVxuICAgICAgaWYgKG1heFAgPiBmdWxsUmFuZ2UubWF4KSB7IG1pblAgLT0gbWF4UCAtIGZ1bGxSYW5nZS5tYXg7IG1heFAgPSBmdWxsUmFuZ2UubWF4OyB9XG4gICAgfVxuICAgIGNvbnN0IGJpZHMgPSBidWlsZExldmVscyhkYXRhLmJpZHMsIFwiYmlkXCIsIG1pblAsIG1heFApO1xuICAgIGNvbnN0IGFza3MgPSBidWlsZExldmVscyhkYXRhLmFza3MsIFwiYXNrXCIsIG1pblAsIG1heFApO1xuICAgIGNvbnN0IG1heExldmVsVXNkID0gTWF0aC5tYXgoMSwgLi4uYmlkcy5tYXAoKGQpID0+IGQudXNkKSwgLi4uYXNrcy5tYXAoKGQpID0+IGQudXNkKSk7XG4gICAgY29uc3QgYmlkVG90YWwgPSBiaWRzLmxlbmd0aCA/IGJpZHNbYmlkcy5sZW5ndGggLSAxXSEuY3VtVXNkIDogMDtcbiAgICBjb25zdCBhc2tUb3RhbCA9IGFza3MubGVuZ3RoID8gYXNrc1thc2tzLmxlbmd0aCAtIDFdIS5jdW1Vc2QgOiAwO1xuICAgIHJldHVybiB7IG1pblAsIG1heFAsIGNlbnRlcjogKG1pblAgKyBtYXhQKSAvIDIsIGJpZHMsIGFza3MsIGJpZFRvdGFsVXNkOiBiaWRUb3RhbCwgYXNrVG90YWxVc2Q6IGFza1RvdGFsLCBtYXhMZXZlbFVzZCB9O1xuICB9LCBbZGF0YSwgZnVsbFJhbmdlLCBjZW50ZXJQcmljZSwgeFpvb21dKTtcblxuICBjb25zdCBzcHJlYWQgPSB1c2VNZW1vKCgpID0+IHtcbiAgICBpZiAoIWRhdGEgfHwgIU51bWJlci5pc0Zpbml0ZShkYXRhLmJlc3RCaWQpIHx8ICFOdW1iZXIuaXNGaW5pdGUoZGF0YS5iZXN0QXNrKSB8fCBkYXRhLmJlc3RBc2sgPT09IEluZmluaXR5KSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gZGF0YS5iZXN0QXNrIC0gZGF0YS5iZXN0QmlkO1xuICB9LCBbZGF0YV0pO1xuXG4gIGNvbnN0IHNwcmVhZEJwcyA9IHVzZU1lbW8oKCkgPT4ge1xuICAgIGlmIChzcHJlYWQgPT0gbnVsbCB8fCAhZGF0YT8ubWlkUHJpY2UpIHJldHVybiBudWxsO1xuICAgIHJldHVybiAoc3ByZWFkIC8gZGF0YS5taWRQcmljZSkgKiAxMDAwMDtcbiAgfSwgW3NwcmVhZCwgZGF0YT8ubWlkUHJpY2VdKTtcblxuICBjb25zdCBjbGFtcENlbnRlciA9IHVzZUNhbGxiYWNrKFxuICAgIChuZXh0Q2VudGVyOiBudW1iZXIsIG5leHRYWm9vbTogbnVtYmVyKSA9PiB7XG4gICAgICBpZiAoIWRhdGEgfHwgIWZ1bGxSYW5nZSkgcmV0dXJuIG5leHRDZW50ZXI7XG4gICAgICBjb25zdCBoYWxmID0gTWF0aC5tYXgoZGF0YS5taWRQcmljZSAqIG5leHRYWm9vbSwgZGF0YS5taWRQcmljZSAqIE1JTl9YX1pPT00pO1xuICAgICAgY29uc3QgbWluQ2VudGVyID0gZnVsbFJhbmdlLm1pbiArIGhhbGY7XG4gICAgICBjb25zdCBtYXhDZW50ZXIgPSBmdWxsUmFuZ2UubWF4IC0gaGFsZjtcbiAgICAgIGlmIChtaW5DZW50ZXIgPiBtYXhDZW50ZXIpIHJldHVybiBkYXRhLm1pZFByaWNlO1xuICAgICAgcmV0dXJuIGNsYW1wKG5leHRDZW50ZXIsIG1pbkNlbnRlciwgbWF4Q2VudGVyKTtcbiAgICB9LFxuICAgIFtkYXRhLCBmdWxsUmFuZ2VdXG4gICk7XG5cbiAgLyogcmVzaXplIG9ic2VydmVyICovXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgY29uc3QgZWwgPSBwbG90UmVmLmN1cnJlbnQ7XG4gICAgaWYgKCFlbCkgcmV0dXJuO1xuICAgIGNvbnN0IHJvID0gbmV3IFJlc2l6ZU9ic2VydmVyKChlbnRyaWVzKSA9PiB7XG4gICAgICBjb25zdCByZWN0ID0gZW50cmllc1swXT8uY29udGVudFJlY3Q7XG4gICAgICBpZiAoIXJlY3QpIHJldHVybjtcbiAgICAgIHNldFNpemUoeyB3aWR0aDogTWF0aC5mbG9vcihyZWN0LndpZHRoKSwgaGVpZ2h0OiBNYXRoLmZsb29yKHJlY3QuaGVpZ2h0KSB9KTtcbiAgICB9KTtcbiAgICByby5vYnNlcnZlKGVsKTtcbiAgICByZXR1cm4gKCkgPT4gcm8uZGlzY29ubmVjdCgpO1xuICB9LCBbXSk7XG5cbiAgLyogcmVnaW9uIGRldGVjdGlvbiAqL1xuICBjb25zdCBnZXRSZWdpb24gPSB1c2VDYWxsYmFjayhcbiAgICAobXg6IG51bWJlciwgbXk6IG51bWJlcik6IERyYWdNb2RlIHwgXCJjaGFydFwiID0+IHtcbiAgICAgIGNvbnN0IGlubmVyVyA9IHNpemUud2lkdGggLSBQQUQubGVmdCAtIFBBRC5yaWdodDtcbiAgICAgIGNvbnN0IGlubmVySCA9IHNpemUuaGVpZ2h0IC0gUEFELnRvcCAtIFBBRC5ib3R0b207XG4gICAgICBpZiAoaW5uZXJXIDw9IDAgfHwgaW5uZXJIIDw9IDApIHJldHVybiBudWxsO1xuICAgICAgY29uc3QgaW5YQmFuZCA9IG14ID49IFBBRC5sZWZ0ICYmIG14IDw9IFBBRC5sZWZ0ICsgaW5uZXJXO1xuICAgICAgY29uc3QgaW5ZQmFuZCA9IG15ID49IFBBRC50b3AgJiYgbXkgPD0gUEFELnRvcCArIGlubmVySDtcbiAgICAgIGlmIChteSA+IFBBRC50b3AgKyBpbm5lckggJiYgaW5YQmFuZCkgcmV0dXJuIFwieGF4aXNcIjtcbiAgICAgIGlmICgobXggPCBQQUQubGVmdCB8fCBteCA+IFBBRC5sZWZ0ICsgaW5uZXJXKSAmJiBpbllCYW5kKSByZXR1cm4gXCJ5YXhpc1wiO1xuICAgICAgaWYgKGluWEJhbmQgJiYgaW5ZQmFuZCkgcmV0dXJuIFwiY2hhcnRcIjtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG4gICAgW3NpemVdXG4gICk7XG5cbiAgLyogZHJhdyBiYXNlIGNoYXJ0ICovXG4gIGNvbnN0IGRyYXdCYXNlID0gdXNlQ2FsbGJhY2soKCkgPT4ge1xuICAgIGlmICghdmlldyB8fCAhZGF0YSB8fCAhYmFzZUNhbnZhc1JlZi5jdXJyZW50KSByZXR1cm47XG4gICAgY29uc3QgeyB3aWR0aCwgaGVpZ2h0IH0gPSBzaXplO1xuICAgIGlmICghd2lkdGggfHwgIWhlaWdodCkgcmV0dXJuO1xuICAgIGNvbnN0IGN0eCA9IHNldHVwQ2FudmFzKGJhc2VDYW52YXNSZWYuY3VycmVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgaWYgKCFjdHgpIHJldHVybjtcblxuICAgIGNvbnN0IGlubmVyVyA9IHdpZHRoIC0gUEFELmxlZnQgLSBQQUQucmlnaHQ7XG4gICAgY29uc3QgaW5uZXJIID0gaGVpZ2h0IC0gUEFELnRvcCAtIFBBRC5ib3R0b207XG4gICAgaWYgKGlubmVyVyA8PSAwIHx8IGlubmVySCA8PSAwKSByZXR1cm47XG5cbiAgICBjb25zdCB4Rm9yID0gKHByaWNlOiBudW1iZXIpID0+IFBBRC5sZWZ0ICsgKChwcmljZSAtIHZpZXcubWluUCkgLyAodmlldy5tYXhQIC0gdmlldy5taW5QIHx8IDEpKSAqIGlubmVyVztcblxuICAgIGNvbnN0IHJhd0JpZENlaWwgPSBNYXRoLm1heCh2aWV3LmJpZFRvdGFsVXNkIC8gTWF0aC5tYXgoeVpvb20sIDAuMDAwMSksIDEpO1xuICAgIGNvbnN0IHJhd0Fza0NlaWwgPSBNYXRoLm1heCh2aWV3LmFza1RvdGFsVXNkIC8gTWF0aC5tYXgoeVpvb20sIDAuMDAwMSksIDEpO1xuXG4gICAgY29uc3QgY29tcHV0ZVN0YWJsZUNlaWwgPSAocmF3OiBudW1iZXIsIHByZXY6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgICBjb25zdCBuaWNlQ2VpbCA9IG5pY2VOdW0ocmF3ICogMS4xNSwgZmFsc2UpO1xuICAgICAgaWYgKHByZXYgPD0gMCkgcmV0dXJuIG5pY2VDZWlsO1xuICAgICAgaWYgKHJhdyA+IHByZXYgfHwgcmF3IDwgcHJldiAqIDAuNCkgcmV0dXJuIG5pY2VDZWlsO1xuICAgICAgcmV0dXJuIHByZXY7XG4gICAgfTtcblxuICAgIHN0YWJsZUJpZENlaWxSZWYuY3VycmVudCA9IGNvbXB1dGVTdGFibGVDZWlsKHJhd0JpZENlaWwsIHN0YWJsZUJpZENlaWxSZWYuY3VycmVudCk7XG4gICAgc3RhYmxlQXNrQ2VpbFJlZi5jdXJyZW50ID0gY29tcHV0ZVN0YWJsZUNlaWwocmF3QXNrQ2VpbCwgc3RhYmxlQXNrQ2VpbFJlZi5jdXJyZW50KTtcblxuICAgIGNvbnN0IGJpZENlaWwgPSBzdGFibGVCaWRDZWlsUmVmLmN1cnJlbnQ7XG4gICAgY29uc3QgYXNrQ2VpbCA9IHN0YWJsZUFza0NlaWxSZWYuY3VycmVudDtcbiAgICBjb25zdCBiaWRZRm9yID0gKHVzZDogbnVtYmVyKSA9PiBQQUQudG9wICsgaW5uZXJIIC0gKHVzZCAvIGJpZENlaWwpICogaW5uZXJIO1xuICAgIGNvbnN0IGFza1lGb3IgPSAodXNkOiBudW1iZXIpID0+IFBBRC50b3AgKyBpbm5lckggLSAodXNkIC8gYXNrQ2VpbCkgKiBpbm5lckg7XG5cbiAgICBjdHguZmlsbFN0eWxlID0gXCJyZ2JhKDIsIDExLCAyMCwgMC41NSlcIjtcbiAgICBjdHguZmlsbFJlY3QoMCwgMCwgd2lkdGgsIGhlaWdodCk7XG5cbiAgICBjb25zdCBwcmljZVJhbmdlID0gdmlldy5tYXhQIC0gdmlldy5taW5QO1xuICAgIGNvbnN0IHhUaWNrcyA9IGdlbmVyYXRlVGlja3Modmlldy5taW5QLCB2aWV3Lm1heFAsIDcpO1xuICAgIGNvbnN0IHlUaWNrc0JpZCA9IGdlbmVyYXRlVGlja3MoMCwgYmlkQ2VpbCwgNSk7XG4gICAgY29uc3QgeVRpY2tzQXNrID0gZ2VuZXJhdGVUaWNrcygwLCBhc2tDZWlsLCA1KTtcblxuICAgIC8vIFggZ3JpZGxpbmVzXG4gICAgZm9yIChjb25zdCB0aWNrIG9mIHhUaWNrcykge1xuICAgICAgY29uc3QgeCA9IHhGb3IodGljayk7XG4gICAgICBpZiAoeCA8IFBBRC5sZWZ0IHx8IHggPiBQQUQubGVmdCArIGlubmVyVykgY29udGludWU7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoMjU1LDI1NSwyNTUsMC4wNSlcIjtcbiAgICAgIGN0eC5saW5lV2lkdGggPSAxO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4Lm1vdmVUbyh4LCBQQUQudG9wKTtcbiAgICAgIGN0eC5saW5lVG8oeCwgUEFELnRvcCArIGlubmVySCk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuXG4gICAgLy8gWSBncmlkbGluZXNcbiAgICBmb3IgKGNvbnN0IHRpY2sgb2YgeVRpY2tzQmlkKSB7XG4gICAgICBjb25zdCB5ID0gYmlkWUZvcih0aWNrKTtcbiAgICAgIGlmICh5IDwgUEFELnRvcCB8fCB5ID4gUEFELnRvcCArIGlubmVySCkgY29udGludWU7XG4gICAgICBjdHguc2V0TGluZURhc2goWzIsIDZdKTtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNTUsMjU1LDI1NSwwLjA0KVwiO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IDE7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHgubW92ZVRvKFBBRC5sZWZ0LCB5KTtcbiAgICAgIGN0eC5saW5lVG8oUEFELmxlZnQgKyBpbm5lclcsIHkpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LnNldExpbmVEYXNoKFtdKTtcbiAgICB9XG5cbiAgICAvLyBCaWQgWS1heGlzIGxhYmVscyAobGVmdClcbiAgICBjdHguZm9udCA9ICc2MDAgMTBweCBcIklCTSBQbGV4IE1vbm9cIiwgbW9ub3NwYWNlJztcbiAgICBjdHgudGV4dEFsaWduID0gXCJyaWdodFwiO1xuICAgIGZvciAoY29uc3QgdGljayBvZiB5VGlja3NCaWQpIHtcbiAgICAgIGNvbnN0IHkgPSBiaWRZRm9yKHRpY2spO1xuICAgICAgaWYgKHkgPCBQQUQudG9wICsgMiB8fCB5ID4gUEFELnRvcCArIGlubmVySCAtIDIpIGNvbnRpbnVlO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgwLDI1NSwxNTMsMC41KVwiO1xuICAgICAgY3R4LmZpbGxUZXh0KHNob3J0TW9uZXkodGljayksIFBBRC5sZWZ0IC0gMTAsIHkgKyAzKTtcbiAgICB9XG5cbiAgICAvLyBBc2sgWS1heGlzIGxhYmVscyAocmlnaHQpXG4gICAgY3R4LnRleHRBbGlnbiA9IFwibGVmdFwiO1xuICAgIGZvciAoY29uc3QgdGljayBvZiB5VGlja3NBc2spIHtcbiAgICAgIGNvbnN0IHkgPSBhc2tZRm9yKHRpY2spO1xuICAgICAgaWYgKHkgPCBQQUQudG9wICsgMiB8fCB5ID4gUEFELnRvcCArIGlubmVySCAtIDIpIGNvbnRpbnVlO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgyNTUsNjEsMTEzLDAuNSlcIjtcbiAgICAgIGN0eC5maWxsVGV4dChzaG9ydE1vbmV5KHRpY2spLCBQQUQubGVmdCArIGlubmVyVyArIDEwLCB5ICsgMyk7XG4gICAgfVxuXG4gICAgLy8gSW5kaXZpZHVhbC1sZXZlbCBiYXJzXG4gICAgY29uc3QgYmFyTWF4SCA9IGlubmVySCAqIDAuMTg7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2aWV3LmJpZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGxldmVsID0gdmlldy5iaWRzW2ldITtcbiAgICAgIGNvbnN0IG5leHRQID0gaSArIDEgPCB2aWV3LmJpZHMubGVuZ3RoID8gdmlldy5iaWRzW2kgKyAxXSEucCA6IHZpZXcubWluUDtcbiAgICAgIGNvbnN0IHgxID0geEZvcihuZXh0UCk7XG4gICAgICBjb25zdCB4MiA9IHhGb3IobGV2ZWwucCk7XG4gICAgICBjb25zdCBiYXJIID0gKGxldmVsLnVzZCAvIHZpZXcubWF4TGV2ZWxVc2QpICogYmFyTWF4SDtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMCwgMjU1LCAxNTMsIDAuMTQpXCI7XG4gICAgICBjdHguZmlsbFJlY3QoeDEsIFBBRC50b3AgKyBpbm5lckggLSBiYXJILCBNYXRoLm1heCgxLCB4MiAtIHgxIC0gMSksIGJhckgpO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZpZXcuYXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgbGV2ZWwgPSB2aWV3LmFza3NbaV0hO1xuICAgICAgY29uc3QgbmV4dFAgPSBpICsgMSA8IHZpZXcuYXNrcy5sZW5ndGggPyB2aWV3LmFza3NbaSArIDFdIS5wIDogdmlldy5tYXhQO1xuICAgICAgY29uc3QgeDEgPSB4Rm9yKGxldmVsLnApO1xuICAgICAgY29uc3QgeDIgPSB4Rm9yKG5leHRQKTtcbiAgICAgIGNvbnN0IGJhckggPSAobGV2ZWwudXNkIC8gdmlldy5tYXhMZXZlbFVzZCkgKiBiYXJNYXhIO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgyNTUsIDYxLCAxMTMsIDAuMTQpXCI7XG4gICAgICBjdHguZmlsbFJlY3QoeDEsIFBBRC50b3AgKyBpbm5lckggLSBiYXJILCBNYXRoLm1heCgxLCB4MiAtIHgxIC0gMSksIGJhckgpO1xuICAgIH1cblxuICAgIC8vIEN1bXVsYXRpdmUgZGVwdGggY3VydmVzXG4gICAgY29uc3QgZHJhd0RlcHRoID0gKGxldmVsczogTGV2ZWxQb2ludFtdLCBzaWRlOiBcImJpZFwiIHwgXCJhc2tcIikgPT4ge1xuICAgICAgaWYgKCFsZXZlbHMubGVuZ3RoKSByZXR1cm47XG4gICAgICBjb25zdCBpc0JpZCA9IHNpZGUgPT09IFwiYmlkXCI7XG4gICAgICBjb25zdCBzaWRlWUZvciA9IGlzQmlkID8gYmlkWUZvciA6IGFza1lGb3I7XG4gICAgICBjb25zdCBsaW5lQ29sb3IgPSBpc0JpZCA/IFwicmdiYSgwLDI1NSwxNTMsMC45NilcIiA6IFwicmdiYSgyNTUsNjEsMTEzLDAuOTYpXCI7XG4gICAgICBjb25zdCB0b3BGaWxsID0gaXNCaWQgPyBcInJnYmEoMCwyNTUsMTUzLDAuMTYpXCIgOiBcInJnYmEoMjU1LDYxLDExMywwLjE2KVwiO1xuICAgICAgY29uc3QgYm90dG9tRmlsbCA9IGlzQmlkID8gXCJyZ2JhKDAsMjU1LDE1MywwLjAyKVwiIDogXCJyZ2JhKDI1NSw2MSwxMTMsMC4wMilcIjtcblxuICAgICAgY29uc3QgcGF0aCA9IG5ldyBQYXRoMkQoKTtcbiAgICAgIHBhdGgubW92ZVRvKHhGb3IoZGF0YS5taWRQcmljZSksIHNpZGVZRm9yKDApKTtcbiAgICAgIHBhdGgubGluZVRvKHhGb3IobGV2ZWxzWzBdIS5wKSwgc2lkZVlGb3IoMCkpO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcHJldiA9IGkgPT09IDAgPyAwIDogbGV2ZWxzW2kgLSAxXSEuY3VtVXNkO1xuICAgICAgICBwYXRoLmxpbmVUbyh4Rm9yKGxldmVsc1tpXSEucCksIHNpZGVZRm9yKHByZXYpKTtcbiAgICAgICAgcGF0aC5saW5lVG8oeEZvcihsZXZlbHNbaV0hLnApLCBzaWRlWUZvcihsZXZlbHNbaV0hLmN1bVVzZCkpO1xuICAgICAgfVxuICAgICAgY29uc3QgZmlsbCA9IG5ldyBQYXRoMkQocGF0aCk7XG4gICAgICBmaWxsLmxpbmVUbyh4Rm9yKGxldmVsc1tsZXZlbHMubGVuZ3RoIC0gMV0hLnApLCBzaWRlWUZvcigwKSk7XG4gICAgICBmaWxsLmxpbmVUbyh4Rm9yKGRhdGEubWlkUHJpY2UpLCBzaWRlWUZvcigwKSk7XG4gICAgICBmaWxsLmNsb3NlUGF0aCgpO1xuXG4gICAgICBjb25zdCBncmFkID0gY3R4LmNyZWF0ZUxpbmVhckdyYWRpZW50KDAsIFBBRC50b3AsIDAsIFBBRC50b3AgKyBpbm5lckgpO1xuICAgICAgZ3JhZC5hZGRDb2xvclN0b3AoMCwgdG9wRmlsbCk7XG4gICAgICBncmFkLmFkZENvbG9yU3RvcCgxLCBib3R0b21GaWxsKTtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBncmFkO1xuICAgICAgY3R4LmZpbGwoZmlsbCk7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBsaW5lQ29sb3I7XG4gICAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICAgIGN0eC5zdHJva2UocGF0aCk7XG4gICAgfTtcblxuICAgIGRyYXdEZXB0aCh2aWV3LmJpZHMsIFwiYmlkXCIpO1xuICAgIGRyYXdEZXB0aCh2aWV3LmFza3MsIFwiYXNrXCIpO1xuXG4gICAgLy8gQ3Jvc3NlZCBtYXJrZXQgb3ZlcmxheVxuICAgIGlmIChkYXRhLmlzQ3Jvc3NlZCkge1xuICAgICAgY29uc3QgeDEgPSBNYXRoLm1heChQQUQubGVmdCwgeEZvcihkYXRhLmJlc3RBc2spKTtcbiAgICAgIGNvbnN0IHgyID0gTWF0aC5taW4oUEFELmxlZnQgKyBpbm5lclcsIHhGb3IoZGF0YS5iZXN0QmlkKSk7XG4gICAgICBpZiAoeDIgPiB4MSkge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJyZ2JhKDI1NSwgMTg0LCAwLCAwLjA4KVwiO1xuICAgICAgICBjdHguZmlsbFJlY3QoeDEsIFBBRC50b3AsIHgyIC0geDEsIGlubmVySCk7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNTUsIDE4NCwgMCwgMC4xNilcIjtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKFszLCA0XSk7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyh4MSwgUEFELnRvcCk7IGN0eC5saW5lVG8oeDEsIFBBRC50b3AgKyBpbm5lckgpO1xuICAgICAgICBjdHgubW92ZVRvKHgyLCBQQUQudG9wKTsgY3R4LmxpbmVUbyh4MiwgUEFELnRvcCArIGlubmVySCk7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKFtdKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBNaWQgcHJpY2UgbGluZVxuICAgIGNvbnN0IG1pZFggPSB4Rm9yKGRhdGEubWlkUHJpY2UpO1xuICAgIGN0eC5zZXRMaW5lRGFzaChbMywgNV0pO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSg3OSwgMTcyLCAyNTUsIDAuNylcIjtcbiAgICBjdHgubGluZVdpZHRoID0gMTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhtaWRYLCBQQUQudG9wKTtcbiAgICBjdHgubGluZVRvKG1pZFgsIFBBRC50b3AgKyBpbm5lckgpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHguc2V0TGluZURhc2goW10pO1xuICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoODAsIDE3NCwgMjU1LCAxKVwiO1xuICAgIGN0eC5mb250ID0gJzcwMCAxMXB4IFwiSUJNIFBsZXggTW9ub1wiLCBtb25vc3BhY2UnO1xuICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xuICAgIGN0eC5maWxsVGV4dChcbiAgICAgIGRhdGEubWlkUHJpY2UudG9Mb2NhbGVTdHJpbmcodW5kZWZpbmVkLCB7IG1pbmltdW1GcmFjdGlvbkRpZ2l0czogMCwgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiAwIH0pLFxuICAgICAgbWlkWCxcbiAgICAgIFBBRC50b3AgLSA4XG4gICAgKTtcbiAgICBpZiAoZGF0YS5pc0Nyb3NzZWQpIHtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMjU1LCAxODQsIDAsIDAuOTUpXCI7XG4gICAgICBjdHguZm9udCA9ICc3MDAgMTBweCBcIklCTSBQbGV4IE1vbm9cIiwgbW9ub3NwYWNlJztcbiAgICAgIGN0eC5maWxsVGV4dChcIkNST1NTRURcIiwgbWlkWCwgUEFELnRvcCArIDE0KTtcbiAgICB9XG5cbiAgICAvLyBTaWRlIGxhYmVsc1xuICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMCwyNTUsMTUzLDAuOTUpXCI7XG4gICAgY3R4LnRleHRBbGlnbiA9IFwibGVmdFwiO1xuICAgIGN0eC5mb250ID0gJzcwMCAxMnB4IFwiSUJNIFBsZXggTW9ub1wiLCBtb25vc3BhY2UnO1xuICAgIGN0eC5maWxsVGV4dChcIkJJRFNcIiwgUEFELmxlZnQgKyA0LCBQQUQudG9wICsgMTQpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMjU1LDYxLDExMywwLjk1KVwiO1xuICAgIGN0eC50ZXh0QWxpZ24gPSBcInJpZ2h0XCI7XG4gICAgY3R4LmZpbGxUZXh0KFwiQVNLU1wiLCBQQUQubGVmdCArIGlubmVyVyAtIDQsIFBBRC50b3AgKyAxNCk7XG5cbiAgICAvLyBDaGFydCBib3JkZXJcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoMjU1LDI1NSwyNTUsMC4wNilcIjtcbiAgICBjdHgubGluZVdpZHRoID0gMTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LnJlY3QoUEFELmxlZnQsIFBBRC50b3AsIGlubmVyVywgaW5uZXJIKTtcbiAgICBjdHguc3Ryb2tlKCk7XG5cbiAgICAvLyBYLWF4aXMgdGlja3MgKyBsYWJlbHNcbiAgICBjb25zdCBheGlzWSA9IFBBRC50b3AgKyBpbm5lckg7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgxNDgsMTYzLDE4NCwwLjc4KVwiO1xuICAgIGN0eC5mb250ID0gJzYwMCAxMXB4IFwiSUJNIFBsZXggTW9ub1wiLCBtb25vc3BhY2UnO1xuICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNTUsMjU1LDI1NSwwLjEyKVwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAxO1xuXG4gICAgZm9yIChjb25zdCB0aWNrIG9mIHhUaWNrcykge1xuICAgICAgY29uc3QgeCA9IHhGb3IodGljayk7XG4gICAgICBpZiAoeCA8IFBBRC5sZWZ0IC0gMiB8fCB4ID4gUEFELmxlZnQgKyBpbm5lclcgKyAyKSBjb250aW51ZTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5tb3ZlVG8oeCwgYXhpc1kpO1xuICAgICAgY3R4LmxpbmVUbyh4LCBheGlzWSArIDYpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LmZpbGxUZXh0KHNtYXJ0UHJpY2VGbXQodGljaywgcHJpY2VSYW5nZSksIHgsIGF4aXNZICsgMjApO1xuICAgIH1cblxuICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMTQ4LDE2MywxODQsMC41NSlcIjtcbiAgICBjdHguZm9udCA9ICc3MDAgMTBweCBcIklCTSBQbGV4IE1vbm9cIiwgbW9ub3NwYWNlJztcbiAgICBjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcbiAgICBjdHguZmlsbFRleHQoXCJQUklDRVwiLCBQQUQubGVmdCArIGlubmVyVyAvIDIsIGF4aXNZICsgMzIpO1xuICB9LCBbdmlldywgZGF0YSwgc2l6ZSwgeVpvb21dKTtcblxuICAvKiBkcmF3IG92ZXJsYXkgKi9cbiAgY29uc3QgZHJhd092ZXJsYXkgPSB1c2VDYWxsYmFjaygoKSA9PiB7XG4gICAgaWYgKCFvdmVybGF5Q2FudmFzUmVmLmN1cnJlbnQpIHJldHVybjtcbiAgICBjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IHNpemU7XG4gICAgaWYgKCF3aWR0aCB8fCAhaGVpZ2h0KSByZXR1cm47XG4gICAgY29uc3QgY3R4ID0gc2V0dXBDYW52YXMob3ZlcmxheUNhbnZhc1JlZi5jdXJyZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICBpZiAoIWN0eCB8fCAhdmlldyB8fCAhaG92ZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGlubmVyVyA9IHdpZHRoIC0gUEFELmxlZnQgLSBQQUQucmlnaHQ7XG4gICAgY29uc3QgaW5uZXJIID0gaGVpZ2h0IC0gUEFELnRvcCAtIFBBRC5ib3R0b207XG4gICAgY29uc3QgeEZvciA9IChwcmljZTogbnVtYmVyKSA9PiBQQUQubGVmdCArICgocHJpY2UgLSB2aWV3Lm1pblApIC8gKHZpZXcubWF4UCAtIHZpZXcubWluUCB8fCAxKSkgKiBpbm5lclc7XG4gICAgY29uc3QgYmlkQ2VpbCA9IHN0YWJsZUJpZENlaWxSZWYuY3VycmVudCB8fCBNYXRoLm1heCh2aWV3LmJpZFRvdGFsVXNkIC8gTWF0aC5tYXgoeVpvb20sIDAuMDAwMSksIDEpICogMS4xNTtcbiAgICBjb25zdCBhc2tDZWlsID0gc3RhYmxlQXNrQ2VpbFJlZi5jdXJyZW50IHx8IE1hdGgubWF4KHZpZXcuYXNrVG90YWxVc2QgLyBNYXRoLm1heCh5Wm9vbSwgMC4wMDAxKSwgMSkgKiAxLjE1O1xuICAgIGNvbnN0IGJpZFlGb3IgPSAodXNkOiBudW1iZXIpID0+IFBBRC50b3AgKyBpbm5lckggLSAodXNkIC8gYmlkQ2VpbCkgKiBpbm5lckg7XG4gICAgY29uc3QgYXNrWUZvciA9ICh1c2Q6IG51bWJlcikgPT4gUEFELnRvcCArIGlubmVySCAtICh1c2QgLyBhc2tDZWlsKSAqIGlubmVySDtcblxuICAgIGN0eC5zZXRMaW5lRGFzaChbMywgNV0pO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNTUsMjU1LDI1NSwwLjEyKVwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAxO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGhvdmVyLm1vdXNlWCwgUEFELnRvcCk7XG4gICAgY3R4LmxpbmVUbyhob3Zlci5tb3VzZVgsIFBBRC50b3AgKyBpbm5lckgpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHguc2V0TGluZURhc2goW10pO1xuXG4gICAgaWYgKGhvdmVyLmJpZCkge1xuICAgICAgY29uc3QgeCA9IHhGb3IoaG92ZXIuYmlkLnApO1xuICAgICAgY29uc3QgeSA9IGJpZFlGb3IoaG92ZXIuYmlkLmN1bVVzZCk7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoMCwyNTUsMTUzLDAuMTgpXCI7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHgubW92ZVRvKFBBRC5sZWZ0LCB5KTtcbiAgICAgIGN0eC5saW5lVG8oUEFELmxlZnQgKyBpbm5lclcsIHkpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgwLDI1NSwxNTMsMSlcIjtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5hcmMoeCwgeSwgMy41LCAwLCBNYXRoLlBJICogMik7XG4gICAgICBjdHguZmlsbCgpO1xuICAgIH1cbiAgICBpZiAoaG92ZXIuYXNrKSB7XG4gICAgICBjb25zdCB4ID0geEZvcihob3Zlci5hc2sucCk7XG4gICAgICBjb25zdCB5ID0gYXNrWUZvcihob3Zlci5hc2suY3VtVXNkKTtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNTUsNjEsMTEzLDAuMTgpXCI7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHgubW92ZVRvKFBBRC5sZWZ0LCB5KTtcbiAgICAgIGN0eC5saW5lVG8oUEFELmxlZnQgKyBpbm5lclcsIHkpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgyNTUsNjEsMTEzLDEpXCI7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHguYXJjKHgsIHksIDMuNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LmZpbGwoKTtcbiAgICB9XG4gIH0sIFtzaXplLCB2aWV3LCBob3ZlciwgeVpvb21dKTtcblxuICB1c2VFZmZlY3QoKCkgPT4geyBkcmF3QmFzZSgpOyB9LCBbZHJhd0Jhc2VdKTtcbiAgdXNlRWZmZWN0KCgpID0+IHsgZHJhd092ZXJsYXkoKTsgfSwgW2RyYXdPdmVybGF5XSk7XG5cbiAgLyogbW91c2UgaGFuZGxlcnMgKi9cbiAgY29uc3QgY2FudmFzUmVjdFJlZiA9IHVzZVJlZjxET01SZWN0IHwgbnVsbD4obnVsbCk7XG5cbiAgY29uc3QgaGFuZGxlV2luZG93RHJhZyA9IHVzZUNhbGxiYWNrKFxuICAgIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBpZiAoIXZpZXcgfHwgIWNhbnZhc1JlY3RSZWYuY3VycmVudCkgcmV0dXJuO1xuICAgICAgY29uc3QgcmVjdCA9IGNhbnZhc1JlY3RSZWYuY3VycmVudDtcbiAgICAgIGNvbnN0IG14ID0gZS5jbGllbnRYIC0gcmVjdC5sZWZ0O1xuICAgICAgY29uc3QgbXkgPSBlLmNsaWVudFkgLSByZWN0LnRvcDtcbiAgICAgIGNvbnN0IHsgbW9kZSB9ID0gZHJhZ1JlZi5jdXJyZW50O1xuXG4gICAgICBpZiAobW9kZSA9PT0gXCJ4YXhpc1wiKSB7XG4gICAgICAgIGNvbnN0IGRlbHRhID0gbXggLSBkcmFnUmVmLmN1cnJlbnQuc3RhcnRYO1xuICAgICAgICBjb25zdCBuZXdab29tID0gY2xhbXAoZHJhZ1JlZi5jdXJyZW50LnN0YXJ0WFpvb20gKiBNYXRoLnBvdygyLCBkZWx0YSAvIDEyMCksIE1JTl9YX1pPT00sIE1BWF9YX1pPT00pO1xuICAgICAgICBzZXRYWm9vbShuZXdab29tKTtcbiAgICAgICAgc2V0Q2VudGVyUHJpY2UoY2xhbXBDZW50ZXIoZHJhZ1JlZi5jdXJyZW50LnN0YXJ0Q2VudGVyLCBuZXdab29tKSk7XG4gICAgICAgIHN0YWJsZUJpZENlaWxSZWYuY3VycmVudCA9IDA7XG4gICAgICAgIHN0YWJsZUFza0NlaWxSZWYuY3VycmVudCA9IDA7XG4gICAgICAgIHNldEN1cnNvclN0eWxlKFwiZXctcmVzaXplXCIpO1xuICAgICAgICBzZXRIb3ZlcihudWxsKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9kZSA9PT0gXCJ5YXhpc1wiKSB7XG4gICAgICAgIGNvbnN0IGRlbHRhID0gbXkgLSBkcmFnUmVmLmN1cnJlbnQuc3RhcnRZO1xuICAgICAgICBjb25zdCBuZXdab29tID0gY2xhbXAoZHJhZ1JlZi5jdXJyZW50LnN0YXJ0WVpvb20gKiBNYXRoLnBvdygyLCAtZGVsdGEgLyAxMjApLCBNSU5fWV9aT09NLCBNQVhfWV9aT09NKTtcbiAgICAgICAgc2V0WVpvb20obmV3Wm9vbSk7XG4gICAgICAgIHN0YWJsZUJpZENlaWxSZWYuY3VycmVudCA9IDA7XG4gICAgICAgIHN0YWJsZUFza0NlaWxSZWYuY3VycmVudCA9IDA7XG4gICAgICAgIHNldEN1cnNvclN0eWxlKFwibnMtcmVzaXplXCIpO1xuICAgICAgICBzZXRIb3ZlcihudWxsKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9kZSA9PT0gXCJwYW5cIikge1xuICAgICAgICBjb25zdCBpbm5lclcgPSBzaXplLndpZHRoIC0gUEFELmxlZnQgLSBQQUQucmlnaHQ7XG4gICAgICAgIGlmIChpbm5lclcgPiAwKSB7XG4gICAgICAgICAgY29uc3QgcHJpY2VQZXJQeCA9ICh2aWV3Lm1heFAgLSB2aWV3Lm1pblApIC8gaW5uZXJXO1xuICAgICAgICAgIGNvbnN0IGRlbHRhUHggPSBteCAtIGRyYWdSZWYuY3VycmVudC5zdGFydFg7XG4gICAgICAgICAgc2V0Q2VudGVyUHJpY2UoY2xhbXBDZW50ZXIoZHJhZ1JlZi5jdXJyZW50LnN0YXJ0Q2VudGVyIC0gZGVsdGFQeCAqIHByaWNlUGVyUHgsIHhab29tKSk7XG4gICAgICAgIH1cbiAgICAgICAgc2V0Q3Vyc29yU3R5bGUoXCJncmFiYmluZ1wiKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIFt2aWV3LCBzaXplLCB4Wm9vbSwgY2xhbXBDZW50ZXJdXG4gICk7XG5cbiAgY29uc3QgaGFuZGxlTW91c2VEb3duID0gdXNlQ2FsbGJhY2soXG4gICAgKGU6IFJlYWN0Lk1vdXNlRXZlbnQ8SFRNTENhbnZhc0VsZW1lbnQ+KSA9PiB7XG4gICAgICBjb25zdCByZWN0ID0gZS5jdXJyZW50VGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY2FudmFzUmVjdFJlZi5jdXJyZW50ID0gcmVjdDtcbiAgICAgIGNvbnN0IG14ID0gZS5jbGllbnRYIC0gcmVjdC5sZWZ0O1xuICAgICAgY29uc3QgbXkgPSBlLmNsaWVudFkgLSByZWN0LnRvcDtcbiAgICAgIGNvbnN0IHJlZ2lvbiA9IGdldFJlZ2lvbihteCwgbXkpO1xuXG4gICAgICBpZiAocmVnaW9uID09PSBcInhheGlzXCIgfHwgcmVnaW9uID09PSBcInlheGlzXCIgfHwgcmVnaW9uID09PSBcImNoYXJ0XCIpIHtcbiAgICAgICAgZHJhZ1JlZi5jdXJyZW50ID0ge1xuICAgICAgICAgIG1vZGU6IHJlZ2lvbiA9PT0gXCJjaGFydFwiID8gXCJwYW5cIiA6IHJlZ2lvbixcbiAgICAgICAgICBzdGFydFg6IG14LFxuICAgICAgICAgIHN0YXJ0WTogbXksXG4gICAgICAgICAgc3RhcnRDZW50ZXI6IGNlbnRlclByaWNlID8/IGRhdGE/Lm1pZFByaWNlID8/IDAsXG4gICAgICAgICAgc3RhcnRYWm9vbTogeFpvb20sXG4gICAgICAgICAgc3RhcnRZWm9vbTogeVpvb20sXG4gICAgICAgIH07XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIGhhbmRsZVdpbmRvd0RyYWcpO1xuICAgICAgfVxuICAgIH0sXG4gICAgW2dldFJlZ2lvbiwgY2VudGVyUHJpY2UsIGRhdGE/Lm1pZFByaWNlLCB4Wm9vbSwgeVpvb20sIGhhbmRsZVdpbmRvd0RyYWddXG4gICk7XG5cbiAgY29uc3QgaGFuZGxlQ2FudmFzSG92ZXIgPSB1c2VDYWxsYmFjayhcbiAgICAoZTogUmVhY3QuTW91c2VFdmVudDxIVE1MQ2FudmFzRWxlbWVudD4pID0+IHtcbiAgICAgIGlmICghdmlldykgcmV0dXJuO1xuICAgICAgY29uc3QgeyBtb2RlIH0gPSBkcmFnUmVmLmN1cnJlbnQ7XG4gICAgICBpZiAobW9kZSkgcmV0dXJuO1xuXG4gICAgICBjb25zdCByZWN0ID0gZS5jdXJyZW50VGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgbXggPSBlLmNsaWVudFggLSByZWN0LmxlZnQ7XG4gICAgICBjb25zdCBteSA9IGUuY2xpZW50WSAtIHJlY3QudG9wO1xuICAgICAgY29uc3QgaW5uZXJXID0gc2l6ZS53aWR0aCAtIFBBRC5sZWZ0IC0gUEFELnJpZ2h0O1xuXG4gICAgICBjb25zdCByZWdpb24gPSBnZXRSZWdpb24obXgsIG15KTtcbiAgICAgIGlmIChyZWdpb24gPT09IFwieGF4aXNcIikgc2V0Q3Vyc29yU3R5bGUoXCJldy1yZXNpemVcIik7XG4gICAgICBlbHNlIGlmIChyZWdpb24gPT09IFwieWF4aXNcIikgc2V0Q3Vyc29yU3R5bGUoXCJucy1yZXNpemVcIik7XG4gICAgICBlbHNlIHNldEN1cnNvclN0eWxlKFwiY3Jvc3NoYWlyXCIpO1xuXG4gICAgICBpZiAocmVnaW9uID09PSBcImNoYXJ0XCIpIHtcbiAgICAgICAgY29uc3QgcHJpY2UgPSB2aWV3Lm1pblAgKyAoKG14IC0gUEFELmxlZnQpIC8gaW5uZXJXKSAqICh2aWV3Lm1heFAgLSB2aWV3Lm1pblApO1xuICAgICAgICBzZXRIb3Zlcih7XG4gICAgICAgICAgY2xpZW50WDogZS5jbGllbnRYLFxuICAgICAgICAgIGNsaWVudFk6IGUuY2xpZW50WSxcbiAgICAgICAgICBtb3VzZVg6IG14LFxuICAgICAgICAgIG1vdXNlWTogbXksXG4gICAgICAgICAgcHJpY2UsXG4gICAgICAgICAgYmlkOiBmaW5kQmlkQXRQcmljZSh2aWV3LmJpZHMsIHByaWNlKSxcbiAgICAgICAgICBhc2s6IGZpbmRBc2tBdFByaWNlKHZpZXcuYXNrcywgcHJpY2UpLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldEhvdmVyKG51bGwpO1xuICAgICAgfVxuICAgIH0sXG4gICAgW3ZpZXcsIHNpemUsIGdldFJlZ2lvbl1cbiAgKTtcblxuICBjb25zdCBzdG9wRHJhZ2dpbmcgPSB1c2VDYWxsYmFjaygoKSA9PiB7XG4gICAgZHJhZ1JlZi5jdXJyZW50Lm1vZGUgPSBudWxsO1xuICAgIHNldEN1cnNvclN0eWxlKFwiY3Jvc3NoYWlyXCIpO1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIGhhbmRsZVdpbmRvd0RyYWcpO1xuICB9LCBbaGFuZGxlV2luZG93RHJhZ10pO1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHN0b3BEcmFnZ2luZyk7XG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBzdG9wRHJhZ2dpbmcpO1xuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgaGFuZGxlV2luZG93RHJhZyk7XG4gICAgfTtcbiAgfSwgW3N0b3BEcmFnZ2luZywgaGFuZGxlV2luZG93RHJhZ10pO1xuXG4gIGNvbnN0IHJlc2V0VmlldyA9IHVzZUNhbGxiYWNrKCgpID0+IHtcbiAgICBpZiAoIWRhdGEpIHJldHVybjtcbiAgICBzZXRYWm9vbShERUZBVUxUX1hfWk9PTSk7XG4gICAgc2V0WVpvb20oREVGQVVMVF9ZX1pPT00pO1xuICAgIHNldENlbnRlclByaWNlKGRhdGEubWlkUHJpY2UpO1xuICAgIHN0YWJsZUJpZENlaWxSZWYuY3VycmVudCA9IDA7XG4gICAgc3RhYmxlQXNrQ2VpbFJlZi5jdXJyZW50ID0gMDtcbiAgfSwgW2RhdGFdKTtcblxuICBjb25zdCBoYW5kbGVYU2xpZGVyID0gdXNlQ2FsbGJhY2soXG4gICAgKHZhbDogbnVtYmVyW10pID0+IHtcbiAgICAgIGNvbnN0IG5leHQgPSBzbGlkZXJUb1godmFsWzBdISk7XG4gICAgICBzZXRYWm9vbShuZXh0KTtcbiAgICAgIHN0YWJsZUJpZENlaWxSZWYuY3VycmVudCA9IDA7XG4gICAgICBzdGFibGVBc2tDZWlsUmVmLmN1cnJlbnQgPSAwO1xuICAgICAgaWYgKGRhdGEpIHNldENlbnRlclByaWNlKGNsYW1wQ2VudGVyKGNlbnRlclByaWNlID8/IGRhdGEubWlkUHJpY2UsIG5leHQpKTtcbiAgICB9LFxuICAgIFtkYXRhLCBjZW50ZXJQcmljZSwgY2xhbXBDZW50ZXJdXG4gICk7XG5cbiAgY29uc3QgaGFuZGxlWVNsaWRlciA9IHVzZUNhbGxiYWNrKCh2YWw6IG51bWJlcltdKSA9PiB7XG4gICAgc2V0WVpvb20oc2xpZGVyVG9ZKHZhbFswXSEpKTtcbiAgICBzdGFibGVCaWRDZWlsUmVmLmN1cnJlbnQgPSAwO1xuICAgIHN0YWJsZUFza0NlaWxSZWYuY3VycmVudCA9IDA7XG4gIH0sIFtdKTtcblxuICBjb25zdCBkaXNwbGF5QmlkcyA9IHVzZU1lbW8oKCkgPT4gKHZpZXc/LmJpZHMgPz8gW10pLnNsaWNlKDAsIFJPV19DT1VOVCksIFt2aWV3Py5iaWRzXSk7XG4gIGNvbnN0IGRpc3BsYXlBc2tzID0gdXNlTWVtbygoKSA9PiAodmlldz8uYXNrcyA/PyBbXSkuc2xpY2UoMCwgUk9XX0NPVU5UKSwgW3ZpZXc/LmFza3NdKTtcblxuICByZXR1cm4gKFxuICAgIDxUb29sdGlwUHJvdmlkZXIgZGVsYXlEdXJhdGlvbj17MjAwfT5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiY2ctZ2xhc3Mgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbm9uZSB0ZXh0LXdoaXRlXCIgc3R5bGU9e3sgZ3JpZENvbHVtbjogXCIxIC8gLTFcIiB9fT5cbiAgICAgICAgey8qIGhlYWRlciAqL31cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJib3JkZXItYiBib3JkZXItd2hpdGUvMTAgYmctd2hpdGUvWzAuMDNdIHB4LTQgcHktM1wiPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1zdGFydCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgZmxleC13cmFwXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC13cmFwIGl0ZW1zLWNlbnRlciBnYXAtNlwiPlxuICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1bMTFweF0gZm9udC1zZW1pYm9sZCB1cHBlcmNhc2UgdHJhY2tpbmctWzAuMjZlbV0gdGV4dC1zbGF0ZS01MDBcIj5EZXB0aCBDaGFydDwvZGl2PlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtWzExcHhdIHVwcGVyY2FzZSB0cmFja2luZy1bMC4xOGVtXSB0ZXh0LXNsYXRlLTUwMFwiPkJpZHMge3ZpZXcgPyBgLSR7cGN0TGFiZWwoeFpvb20pfWAgOiBcIlwifTwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzE0cHhdIGZvbnQtc2VtaWJvbGQgdGV4dC1lbWVyYWxkLTQwMFwiPntzaG9ydE1vbmV5KHZpZXc/LmJpZFRvdGFsVXNkID8/IDApfTwvZGl2PlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtWzExcHhdIHVwcGVyY2FzZSB0cmFja2luZy1bMC4xOGVtXSB0ZXh0LXNsYXRlLTUwMFwiPkFza3Mge3ZpZXcgPyBgKyR7cGN0TGFiZWwoeFpvb20pfWAgOiBcIlwifTwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzE0cHhdIGZvbnQtc2VtaWJvbGQgdGV4dC1yb3NlLTQwMFwiPntzaG9ydE1vbmV5KHZpZXc/LmFza1RvdGFsVXNkID8/IDApfTwvZGl2PlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtWzExcHhdIHVwcGVyY2FzZSB0cmFja2luZy1bMC4xOGVtXSB0ZXh0LXNsYXRlLTUwMFwiPlNwcmVhZDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzE0cHhdIGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS0xMDBcIj5cbiAgICAgICAgICAgICAgICAgIHtzcHJlYWQgIT0gbnVsbFxuICAgICAgICAgICAgICAgICAgICA/IGAke3NwcmVhZC50b0xvY2FsZVN0cmluZyh1bmRlZmluZWQsIHsgbWluaW11bUZyYWN0aW9uRGlnaXRzOiAyLCBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDIgfSl9JHtzcHJlYWRCcHMgIT0gbnVsbCA/IGAg4oCiICR7c3ByZWFkQnBzLnRvRml4ZWQoMSl9IGJwc2AgOiBcIlwifWBcbiAgICAgICAgICAgICAgICAgICAgOiBcIuKAlFwifVxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC00IGZsZXgtd3JhcFwiPlxuICAgICAgICAgICAgICA8VG9vbHRpcD5cbiAgICAgICAgICAgICAgICA8VG9vbHRpcFRyaWdnZXIgYXNDaGlsZD5cbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTIuNVwiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMXB4XSB1cHBlcmNhc2UgdHJhY2tpbmctWzAuMThlbV0gdGV4dC1zbGF0ZS01MDAgd2hpdGVzcGFjZS1ub3dyYXBcIj5YIFJhbmdlPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8U2xpZGVyIHZhbHVlPXtbeFRvU2xpZGVyKHhab29tKV19IG9uVmFsdWVDaGFuZ2U9e2hhbmRsZVhTbGlkZXJ9IG1pbj17MH0gbWF4PXsxMDB9IHN0ZXA9ezAuNX0gY2xhc3NOYW1lPVwidy0yNFwiIC8+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyB0ZXh0LVsxMXB4XSB0ZXh0LXNsYXRlLTMwMCBtaW4tdy1bNDhweF0gdGV4dC1yaWdodFwiPntwY3RMYWJlbCh4Wm9vbSl9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9Ub29sdGlwVHJpZ2dlcj5cbiAgICAgICAgICAgICAgICA8VG9vbHRpcENvbnRlbnQgc2lkZT1cImJvdHRvbVwiIGNsYXNzTmFtZT1cInRleHQteHNcIj5QcmljZSByYW5nZSBhcm91bmQgbWlkIMK3IGRyYWcgWCBheGlzIHRvIHpvb208L1Rvb2x0aXBDb250ZW50PlxuICAgICAgICAgICAgICA8L1Rvb2x0aXA+XG5cbiAgICAgICAgICAgICAgPFRvb2x0aXA+XG4gICAgICAgICAgICAgICAgPFRvb2x0aXBUcmlnZ2VyIGFzQ2hpbGQ+XG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yLjVcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTFweF0gdXBwZXJjYXNlIHRyYWNraW5nLVswLjE4ZW1dIHRleHQtc2xhdGUtNTAwIHdoaXRlc3BhY2Utbm93cmFwXCI+WSBTY2FsZTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPFNsaWRlciB2YWx1ZT17W3lUb1NsaWRlcih5Wm9vbSldfSBvblZhbHVlQ2hhbmdlPXtoYW5kbGVZU2xpZGVyfSBtaW49ezB9IG1heD17MTAwfSBzdGVwPXswLjV9IGNsYXNzTmFtZT1cInctMjRcIiAvPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJmb250LW1vbm8gdGV4dC1bMTFweF0gdGV4dC1zbGF0ZS0zMDAgbWluLXctWzM2cHhdIHRleHQtcmlnaHRcIj57eVpvb20udG9GaXhlZCgxKX3Dlzwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvVG9vbHRpcFRyaWdnZXI+XG4gICAgICAgICAgICAgICAgPFRvb2x0aXBDb250ZW50IHNpZGU9XCJib3R0b21cIiBjbGFzc05hbWU9XCJ0ZXh0LXhzXCI+VmFsdWUgYXhpcyBzY2FsZSDCtyBkcmFnIFkgYXhpcyB0byB6b29tPC9Ub29sdGlwQ29udGVudD5cbiAgICAgICAgICAgICAgPC9Ub29sdGlwPlxuXG4gICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICBvbkNsaWNrPXtyZXNldFZpZXd9XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwicm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXdoaXRlLzYgYmctd2hpdGUvWzAuMDNdIHB4LTMgcHktMS41IHRleHQtWzExcHhdIGZvbnQtbW9ubyBmb250LXNlbWlib2xkIHRleHQtc2xhdGUtNDAwIHRyYW5zaXRpb24gaG92ZXI6Ym9yZGVyLXdoaXRlLzEyIGhvdmVyOnRleHQtc2xhdGUtMjAwXCJcbiAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIFJFU0VUXG4gICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIHsvKiBjaGFydCBhcmVhICovfVxuICAgICAgICA8ZGl2XG4gICAgICAgICAgcmVmPXtwbG90UmVmfVxuICAgICAgICAgIGNsYXNzTmFtZT1cInJlbGF0aXZlIHctZnVsbCBzZWxlY3Qtbm9uZSBib3JkZXItYiBib3JkZXItd2hpdGUvMTAgYmctdHJhbnNwYXJlbnRcIlxuICAgICAgICAgIHN0eWxlPXt7IGhlaWdodDogXCJjbGFtcCgyNjBweCwgMzZ2aCwgNDQwcHgpXCIgfX1cbiAgICAgICAgPlxuICAgICAgICAgIHshdmlldyA/IChcbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWJzb2x1dGUgaW5zZXQtMCBncmlkIHBsYWNlLWl0ZW1zLWNlbnRlciB0ZXh0LXNtIHRleHQtc2xhdGUtNTAwXCI+Tm8gZGVwdGggZGF0YTwvZGl2PlxuICAgICAgICAgICkgOiAoXG4gICAgICAgICAgICA8PlxuICAgICAgICAgICAgICA8Y2FudmFzIHJlZj17YmFzZUNhbnZhc1JlZn0gY2xhc3NOYW1lPVwiYWJzb2x1dGUgaW5zZXQtMCBibG9ja1wiIC8+XG4gICAgICAgICAgICAgIDxjYW52YXNcbiAgICAgICAgICAgICAgICByZWY9e292ZXJsYXlDYW52YXNSZWZ9XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYWJzb2x1dGUgaW5zZXQtMCBibG9ja1wiXG4gICAgICAgICAgICAgICAgc3R5bGU9e3sgY3Vyc29yOiBjdXJzb3JTdHlsZSwgdG91Y2hBY3Rpb246IFwibm9uZVwiIH19XG4gICAgICAgICAgICAgICAgb25Nb3VzZU1vdmU9e2hhbmRsZUNhbnZhc0hvdmVyfVxuICAgICAgICAgICAgICAgIG9uTW91c2VMZWF2ZT17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKCFkcmFnUmVmLmN1cnJlbnQubW9kZSkge1xuICAgICAgICAgICAgICAgICAgICBzZXRIb3ZlcihudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgc2V0Q3Vyc29yU3R5bGUoXCJjcm9zc2hhaXJcIik7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICBvbk1vdXNlRG93bj17aGFuZGxlTW91c2VEb3dufVxuICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC8+XG4gICAgICAgICAgKX1cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIHRhYmxlcyAqL31cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJncmlkIGdyaWQtY29scy0xIGRpdmlkZS15IGRpdmlkZS13aGl0ZS8xMCBsZzpncmlkLWNvbHMtMiBsZzpkaXZpZGUteCBsZzpkaXZpZGUteS0wXCI+XG4gICAgICAgICAgPERlcHRoVGFibGUgdGl0bGU9XCJCaWRzXCIgdG9uZT1cImJpZFwiIHJvd3M9e2Rpc3BsYXlCaWRzfSAvPlxuICAgICAgICAgIDxEZXB0aFRhYmxlIHRpdGxlPVwiQXNrc1wiIHRvbmU9XCJhc2tcIiByb3dzPXtkaXNwbGF5QXNrc30gLz5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIGhvdmVyIHRvb2x0aXAgKi99XG4gICAgICAgIHtob3ZlciAmJiAoXG4gICAgICAgICAgPGRpdlxuICAgICAgICAgICAgY2xhc3NOYW1lPVwicG9pbnRlci1ldmVudHMtbm9uZSBmaXhlZCB6LVsyMDBdIG1pbi13LVsyMzBweF0gcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXdoaXRlLzEyIGJnLWNhcmQvNTUgcHgtMyBweS0yIHRleHQtWzExcHhdIHNoYWRvdy0yeGwgYmFja2Ryb3AtYmx1ci0yeGxcIlxuICAgICAgICAgICAgc3R5bGU9e3tcbiAgICAgICAgICAgICAgbGVmdDogaG92ZXIuY2xpZW50WCArIDI1MCA+IHdpbmRvdy5pbm5lcldpZHRoID8gaG92ZXIuY2xpZW50WCAtIDI0MCA6IGhvdmVyLmNsaWVudFggKyAxNCxcbiAgICAgICAgICAgICAgdG9wOiBNYXRoLm1pbihob3Zlci5jbGllbnRZIC0gMTAsIHdpbmRvdy5pbm5lckhlaWdodCAtIDE3MCksXG4gICAgICAgICAgICB9fVxuICAgICAgICAgID5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWItMiBmb250LW1vbm8gdGV4dC1bMTNweF0gZm9udC1ib2xkIHRleHQtd2hpdGVcIj5cbiAgICAgICAgICAgICAge2hvdmVyLnByaWNlLnRvTG9jYWxlU3RyaW5nKHVuZGVmaW5lZCwgeyBtaW5pbXVtRnJhY3Rpb25EaWdpdHM6IDIsIG1heGltdW1GcmFjdGlvbkRpZ2l0czogMiB9KX1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBnYXAtNiBweS0wLjVcIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS01MDBcIj5CaWQgVmFsdWU8L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyB0ZXh0LWVtZXJhbGQtNDAwXCI+e3Nob3J0TW9uZXkoaG92ZXIuYmlkPy51c2QgPz8gMCl9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGdhcC02IHB5LTAuNVwiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMFwiPkJpZCBUb3RhbDwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtZW1lcmFsZC00MDBcIj57c2hvcnRNb25leShob3Zlci5iaWQ/LmN1bVVzZCA/PyAwKX08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTYgcHktMC41XCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNTAwXCI+QXNrIFZhbHVlPC9zcGFuPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJmb250LW1vbm8gdGV4dC1yb3NlLTQwMFwiPntzaG9ydE1vbmV5KGhvdmVyLmFzaz8udXNkID8/IDApfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBnYXAtNiBweS0wLjVcIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS01MDBcIj5Bc2sgVG90YWw8L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyB0ZXh0LXJvc2UtNDAwXCI+e3Nob3J0TW9uZXkoaG92ZXIuYXNrPy5jdW1Vc2QgPz8gMCl9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICl9XG4gICAgICA8L2Rpdj5cbiAgICA8L1Rvb2x0aXBQcm92aWRlcj5cbiAgKTtcbn1cbiJdLCJuYW1lcyI6WyJ1c2VNZW1vIiwidXNlRWZmZWN0IiwidXNlUmVmIiwidXNlU3RhdGUiLCJ1c2VDYWxsYmFjayIsIlNsaWRlciIsIkJ1dHRvbiIsIlRvb2x0aXAiLCJUb29sdGlwQ29udGVudCIsIlRvb2x0aXBUcmlnZ2VyIiwiVG9vbHRpcFByb3ZpZGVyIiwiRGVwdGhUYWJsZSIsImNsYW1wIiwic2V0dXBDYW52YXMiLCJuaWNlTnVtIiwiZ2VuZXJhdGVUaWNrcyIsInNtYXJ0UHJpY2VGbXQiLCJzaG9ydE1vbmV5IiwicGN0TGFiZWwiLCJidWlsZExldmVscyIsImZpbmRCaWRBdFByaWNlIiwiZmluZEFza0F0UHJpY2UiLCJQQUQiLCJ0b3AiLCJyaWdodCIsImJvdHRvbSIsImxlZnQiLCJNSU5fWF9aT09NIiwiTUFYX1hfWk9PTSIsIkRFRkFVTFRfWF9aT09NIiwiTUlOX1lfWk9PTSIsIk1BWF9ZX1pPT00iLCJERUZBVUxUX1lfWk9PTSIsIlJPV19DT1VOVCIsInhUb1NsaWRlciIsInoiLCJNYXRoIiwibG9nIiwic2xpZGVyVG9YIiwidiIsInBvdyIsInlUb1NsaWRlciIsInNsaWRlclRvWSIsIkRlcHRoQ2hhcnQiLCJkYXRhIiwicGxvdFJlZiIsImJhc2VDYW52YXNSZWYiLCJvdmVybGF5Q2FudmFzUmVmIiwiZHJhZ1JlZiIsIm1vZGUiLCJzdGFydFgiLCJzdGFydFkiLCJzdGFydENlbnRlciIsInN0YXJ0WFpvb20iLCJzdGFydFlab29tIiwic2l6ZSIsInNldFNpemUiLCJ3aWR0aCIsImhlaWdodCIsInhab29tIiwic2V0WFpvb20iLCJ5Wm9vbSIsInNldFlab29tIiwiY2VudGVyUHJpY2UiLCJzZXRDZW50ZXJQcmljZSIsImhvdmVyIiwic2V0SG92ZXIiLCJjdXJzb3JTdHlsZSIsInNldEN1cnNvclN0eWxlIiwic3RhYmxlQmlkQ2VpbFJlZiIsInN0YWJsZUFza0NlaWxSZWYiLCJmdWxsUmFuZ2UiLCJiaWRNaW4iLCJiaWRzIiwibGVuZ3RoIiwibWluIiwibWFwIiwicCIsIm1pZFByaWNlIiwiYXNrTWF4IiwiYXNrcyIsIm1heCIsImJlc3RCaWQiLCJOdW1iZXIiLCJpc0Zpbml0ZSIsImJlc3RBc2siLCJwcmV2IiwidmlldyIsIm1pZCIsImNlbnRlciIsImhhbGYiLCJtaW5QIiwibWF4UCIsImZ1bGxXaWR0aCIsInZpc2libGVXaWR0aCIsIm1heExldmVsVXNkIiwiZCIsInVzZCIsImJpZFRvdGFsIiwiY3VtVXNkIiwiYXNrVG90YWwiLCJiaWRUb3RhbFVzZCIsImFza1RvdGFsVXNkIiwic3ByZWFkIiwiSW5maW5pdHkiLCJzcHJlYWRCcHMiLCJjbGFtcENlbnRlciIsIm5leHRDZW50ZXIiLCJuZXh0WFpvb20iLCJtaW5DZW50ZXIiLCJtYXhDZW50ZXIiLCJlbCIsImN1cnJlbnQiLCJybyIsIlJlc2l6ZU9ic2VydmVyIiwiZW50cmllcyIsInJlY3QiLCJjb250ZW50UmVjdCIsImZsb29yIiwib2JzZXJ2ZSIsImRpc2Nvbm5lY3QiLCJnZXRSZWdpb24iLCJteCIsIm15IiwiaW5uZXJXIiwiaW5uZXJIIiwiaW5YQmFuZCIsImluWUJhbmQiLCJkcmF3QmFzZSIsImN0eCIsInhGb3IiLCJwcmljZSIsInJhd0JpZENlaWwiLCJyYXdBc2tDZWlsIiwiY29tcHV0ZVN0YWJsZUNlaWwiLCJyYXciLCJuaWNlQ2VpbCIsImJpZENlaWwiLCJhc2tDZWlsIiwiYmlkWUZvciIsImFza1lGb3IiLCJmaWxsU3R5bGUiLCJmaWxsUmVjdCIsInByaWNlUmFuZ2UiLCJ4VGlja3MiLCJ5VGlja3NCaWQiLCJ5VGlja3NBc2siLCJ0aWNrIiwieCIsInN0cm9rZVN0eWxlIiwibGluZVdpZHRoIiwiYmVnaW5QYXRoIiwibW92ZVRvIiwibGluZVRvIiwic3Ryb2tlIiwieSIsInNldExpbmVEYXNoIiwiZm9udCIsInRleHRBbGlnbiIsImZpbGxUZXh0IiwiYmFyTWF4SCIsImkiLCJsZXZlbCIsIm5leHRQIiwieDEiLCJ4MiIsImJhckgiLCJkcmF3RGVwdGgiLCJsZXZlbHMiLCJzaWRlIiwiaXNCaWQiLCJzaWRlWUZvciIsImxpbmVDb2xvciIsInRvcEZpbGwiLCJib3R0b21GaWxsIiwicGF0aCIsIlBhdGgyRCIsImZpbGwiLCJjbG9zZVBhdGgiLCJncmFkIiwiY3JlYXRlTGluZWFyR3JhZGllbnQiLCJhZGRDb2xvclN0b3AiLCJpc0Nyb3NzZWQiLCJtaWRYIiwidG9Mb2NhbGVTdHJpbmciLCJ1bmRlZmluZWQiLCJtaW5pbXVtRnJhY3Rpb25EaWdpdHMiLCJtYXhpbXVtRnJhY3Rpb25EaWdpdHMiLCJheGlzWSIsImRyYXdPdmVybGF5IiwibW91c2VYIiwiYmlkIiwiYXJjIiwiUEkiLCJhc2siLCJjYW52YXNSZWN0UmVmIiwiaGFuZGxlV2luZG93RHJhZyIsImUiLCJjbGllbnRYIiwiY2xpZW50WSIsImRlbHRhIiwibmV3Wm9vbSIsInByaWNlUGVyUHgiLCJkZWx0YVB4IiwiaGFuZGxlTW91c2VEb3duIiwiY3VycmVudFRhcmdldCIsImdldEJvdW5kaW5nQ2xpZW50UmVjdCIsInJlZ2lvbiIsIndpbmRvdyIsImFkZEV2ZW50TGlzdGVuZXIiLCJoYW5kbGVDYW52YXNIb3ZlciIsIm1vdXNlWSIsInN0b3BEcmFnZ2luZyIsInJlbW92ZUV2ZW50TGlzdGVuZXIiLCJyZXNldFZpZXciLCJoYW5kbGVYU2xpZGVyIiwidmFsIiwibmV4dCIsImhhbmRsZVlTbGlkZXIiLCJkaXNwbGF5QmlkcyIsInNsaWNlIiwiZGlzcGxheUFza3MiLCJkZWxheUR1cmF0aW9uIiwiZGl2IiwiY2xhc3NOYW1lIiwic3R5bGUiLCJncmlkQ29sdW1uIiwidG9GaXhlZCIsImFzQ2hpbGQiLCJzcGFuIiwidmFsdWUiLCJvblZhbHVlQ2hhbmdlIiwic3RlcCIsIm9uQ2xpY2siLCJyZWYiLCJjYW52YXMiLCJjdXJzb3IiLCJ0b3VjaEFjdGlvbiIsIm9uTW91c2VNb3ZlIiwib25Nb3VzZUxlYXZlIiwib25Nb3VzZURvd24iLCJ0aXRsZSIsInRvbmUiLCJyb3dzIiwiaW5uZXJXaWR0aCIsImlubmVySGVpZ2h0Il0sIm1hcHBpbmdzIjoi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