(function () {
    const RATIO_CONFIG = Object.freeze({
        '9:16': Object.freeze({ width: 360, height: 640, canvasW: 720, canvasH: 960, exportW: 1080, exportH: 1920 }),
        '16:9': Object.freeze({ width: 640, height: 360, canvasW: 960, canvasH: 720, exportW: 1920, exportH: 1080 }),
        '1:1': Object.freeze({ width: 480, height: 480, canvasW: 900, canvasH: 900, exportW: 1080, exportH: 1080 })
    });

    function getConfig(aspectRatio) {
        return RATIO_CONFIG[aspectRatio] || RATIO_CONFIG['9:16'];
    }

    function getSafeOffset(cfg) {
        return {
            x: Math.round((cfg.canvasW - cfg.width) / 2),
            y: Math.round((cfg.canvasH - cfg.height) / 2)
        };
    }

    function getExportSize(aspectRatio) {
        const cfg = getConfig(aspectRatio);
        return { width: cfg.exportW, height: cfg.exportH };
    }

    function getCanvasSize(aspectRatio) {
        const cfg = getConfig(aspectRatio);
        return { width: cfg.canvasW, height: cfg.canvasH };
    }

    function getSafeArea(aspectRatio) {
        const cfg = getConfig(aspectRatio);
        const offset = getSafeOffset(cfg);
        return { width: cfg.width, height: cfg.height, x: offset.x, y: offset.y };
    }

    function exportScaling(aspectRatio) {
        const cfg = getConfig(aspectRatio);
        const offset = getSafeOffset(cfg);
        return {
            sx: cfg.exportW / cfg.width,
            sy: cfg.exportH / cfg.height,
            safeOffset: offset,
            safeSize: { width: cfg.width, height: cfg.height },
            canvasSize: { width: cfg.canvasW, height: cfg.canvasH },
            exportSize: { width: cfg.exportW, height: cfg.exportH }
        };
    }

    function logicalToStage(item, aspectRatio) {
        const cfg = getConfig(aspectRatio);
        const offset = getSafeOffset(cfg);
        const sx = cfg.width / cfg.exportW;
        const sy = cfg.height / cfg.exportH;

        const logicalX = item && item.x !== undefined ? item.x : 90;
        const logicalY = item && item.y !== undefined ? item.y : 800;
        const logicalW = item && item.w !== undefined ? item.w : (item && item.width !== undefined ? item.width : 900);
        const logicalH = item && item.h !== undefined ? item.h : (item && item.height !== undefined ? item.height : 160);

        return {
            x: Math.round(offset.x + logicalX * sx),
            y: Math.round(offset.y + logicalY * sy),
            width: Math.round(logicalW * sx),
            height: Math.round(logicalH * sy),
            w: logicalW,
            h: logicalH
        };
    }

    function stageToLogical(item, aspectRatio) {
        const cfg = getConfig(aspectRatio);
        const offset = getSafeOffset(cfg);
        const sx = cfg.exportW / cfg.width;
        const sy = cfg.exportH / cfg.height;

        return {
            x: Math.round((((item && item.x) || 0) - offset.x) * sx),
            y: Math.round((((item && item.y) || 0) - offset.y) * sy),
            w: Math.round(((item && item.width) || 0) * sx),
            h: Math.round(((item && item.height) || 0) * sy)
        };
    }

    function safeAreaToExport(item, aspectRatio) {
        const scaling = exportScaling(aspectRatio);
        return {
            x: Math.round((((item && item.x) || 0) - scaling.safeOffset.x) * scaling.sx),
            y: Math.round((((item && item.y) || 0) - scaling.safeOffset.y) * scaling.sy),
            width: Math.round(((item && item.width) || 0) * scaling.sx),
            height: Math.round(((item && item.height) || 0) * scaling.sy)
        };
    }

    window.MenuDesignerCoordinateEngine = Object.freeze({
        getConfig,
        getSafeArea,
        getCanvasSize,
        getExportSize,
        stageToLogical,
        logicalToStage,
        safeAreaToExport,
        exportScaling
    });
})();
