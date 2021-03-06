import { RoughPath, RoughArcConverter, PathFitter } from './path.js';
import { getFiller } from './fillers/filler';
export class RoughRenderer {
    line(x1, y1, x2, y2, o) {
        const ops = this.doubleLine(x1, y1, x2, y2, o);
        return { type: 'path', ops };
    }
    linearPath(points, close, o) {
        const len = (points || []).length;
        if (len > 2) {
            let ops = [];
            for (let i = 0; i < (len - 1); i++) {
                ops = ops.concat(this.doubleLine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], o));
            }
            if (close) {
                ops = ops.concat(this.doubleLine(points[len - 1][0], points[len - 1][1], points[0][0], points[0][1], o));
            }
            return { type: 'path', ops };
        }
        else if (len === 2) {
            return this.line(points[0][0], points[0][1], points[1][0], points[1][1], o);
        }
        return { type: 'path', ops: [] };
    }
    polygon(points, o) {
        return this.linearPath(points, true, o);
    }
    rectangle(x, y, width, height, o) {
        const points = [
            [x, y], [x + width, y], [x + width, y + height], [x, y + height]
        ];
        return this.polygon(points, o);
    }
    curve(points, o) {
        const o1 = this._curveWithOffset(points, 1 * (1 + o.roughness * 0.2), o);
        const o2 = this._curveWithOffset(points, 1.5 * (1 + o.roughness * 0.22), o);
        return { type: 'path', ops: o1.concat(o2) };
    }
    ellipse(x, y, width, height, o) {
        const increment = (Math.PI * 2) / o.curveStepCount;
        let rx = Math.abs(width / 2);
        let ry = Math.abs(height / 2);
        rx += this.getOffset(-rx * 0.05, rx * 0.05, o);
        ry += this.getOffset(-ry * 0.05, ry * 0.05, o);
        const o1 = this._ellipse(increment, x, y, rx, ry, 1, increment * this.getOffset(0.1, this.getOffset(0.4, 1, o), o), o);
        const o2 = this._ellipse(increment, x, y, rx, ry, 1.5, 0, o);
        return { type: 'path', ops: o1.concat(o2) };
    }
    arc(x, y, width, height, start, stop, closed, roughClosure, o) {
        const cx = x;
        const cy = y;
        let rx = Math.abs(width / 2);
        let ry = Math.abs(height / 2);
        rx += this.getOffset(-rx * 0.01, rx * 0.01, o);
        ry += this.getOffset(-ry * 0.01, ry * 0.01, o);
        let strt = start;
        let stp = stop;
        while (strt < 0) {
            strt += Math.PI * 2;
            stp += Math.PI * 2;
        }
        if ((stp - strt) > (Math.PI * 2)) {
            strt = 0;
            stp = Math.PI * 2;
        }
        const ellipseInc = (Math.PI * 2) / o.curveStepCount;
        const arcInc = Math.min(ellipseInc / 2, (stp - strt) / 2);
        const o1 = this._arc(arcInc, cx, cy, rx, ry, strt, stp, 1, o);
        const o2 = this._arc(arcInc, cx, cy, rx, ry, strt, stp, 1.5, o);
        let ops = o1.concat(o2);
        if (closed) {
            if (roughClosure) {
                ops = ops.concat(this.doubleLine(cx, cy, cx + rx * Math.cos(strt), cy + ry * Math.sin(strt), o));
                ops = ops.concat(this.doubleLine(cx, cy, cx + rx * Math.cos(stp), cy + ry * Math.sin(stp), o));
            }
            else {
                ops.push({ op: 'lineTo', data: [cx, cy] });
                ops.push({ op: 'lineTo', data: [cx + rx * Math.cos(strt), cy + ry * Math.sin(strt)] });
            }
        }
        return { type: 'path', ops };
    }
    svgPath(path, o) {
        path = (path || '').replace(/\n/g, ' ').replace(/(-\s)/g, '-').replace('/(\s\s)/g', ' ');
        let p = new RoughPath(path);
        if (o.simplification) {
            const fitter = new PathFitter(p.linearPoints, p.closed);
            const d = fitter.fit(o.simplification);
            p = new RoughPath(d);
        }
        let ops = [];
        const segments = p.segments || [];
        for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            const prev = i > 0 ? segments[i - 1] : null;
            const opList = this._processSegment(p, s, prev, o);
            if (opList && opList.length) {
                ops = ops.concat(opList);
            }
        }
        return { type: 'path', ops };
    }
    solidFillPolygon(points, o) {
        const ops = [];
        if (points.length) {
            const offset = o.maxRandomnessOffset || 0;
            const len = points.length;
            if (len > 2) {
                ops.push({ op: 'move', data: [points[0][0] + this.getOffset(-offset, offset, o), points[0][1] + this.getOffset(-offset, offset, o)] });
                for (let i = 1; i < len; i++) {
                    ops.push({ op: 'lineTo', data: [points[i][0] + this.getOffset(-offset, offset, o), points[i][1] + this.getOffset(-offset, offset, o)] });
                }
            }
        }
        return { type: 'fillPath', ops };
    }
    patternFillPolygon(points, o) {
        const filler = getFiller(this, o);
        return filler.fillPolygon(points, o);
    }
    patternFillEllipse(cx, cy, width, height, o) {
        const filler = getFiller(this, o);
        return filler.fillEllipse(cx, cy, width, height, o);
    }
    patternFillArc(x, y, width, height, start, stop, o) {
        const cx = x;
        const cy = y;
        let rx = Math.abs(width / 2);
        let ry = Math.abs(height / 2);
        rx += this.getOffset(-rx * 0.01, rx * 0.01, o);
        ry += this.getOffset(-ry * 0.01, ry * 0.01, o);
        let strt = start;
        let stp = stop;
        while (strt < 0) {
            strt += Math.PI * 2;
            stp += Math.PI * 2;
        }
        if ((stp - strt) > (Math.PI * 2)) {
            strt = 0;
            stp = Math.PI * 2;
        }
        const increment = (stp - strt) / o.curveStepCount;
        const points = [];
        for (let angle = strt; angle <= stp; angle = angle + increment) {
            points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
        }
        points.push([cx + rx * Math.cos(stp), cy + ry * Math.sin(stp)]);
        points.push([cx, cy]);
        return this.patternFillPolygon(points, o);
    }
    /// 
    getOffset(min, max, ops) {
        return ops.roughness * ((Math.random() * (max - min)) + min);
    }
    doubleLine(x1, y1, x2, y2, o) {
        const o1 = this._line(x1, y1, x2, y2, o, true, false);
        const o2 = this._line(x1, y1, x2, y2, o, true, true);
        return o1.concat(o2);
    }
    _line(x1, y1, x2, y2, o, move, overlay) {
        const lengthSq = Math.pow((x1 - x2), 2) + Math.pow((y1 - y2), 2);
        let offset = o.maxRandomnessOffset || 0;
        if ((offset * offset * 100) > lengthSq) {
            offset = Math.sqrt(lengthSq) / 10;
        }
        const halfOffset = offset / 2;
        const divergePoint = 0.2 + Math.random() * 0.2;
        let midDispX = o.bowing * o.maxRandomnessOffset * (y2 - y1) / 200;
        let midDispY = o.bowing * o.maxRandomnessOffset * (x1 - x2) / 200;
        midDispX = this.getOffset(-midDispX, midDispX, o);
        midDispY = this.getOffset(-midDispY, midDispY, o);
        const ops = [];
        if (move) {
            if (overlay) {
                ops.push({
                    op: 'move', data: [
                        x1 + this.getOffset(-halfOffset, halfOffset, o),
                        y1 + this.getOffset(-halfOffset, halfOffset, o)
                    ]
                });
            }
            else {
                ops.push({
                    op: 'move', data: [
                        x1 + this.getOffset(-offset, offset, o),
                        y1 + this.getOffset(-offset, offset, o)
                    ]
                });
            }
        }
        if (overlay) {
            ops.push({
                op: 'bcurveTo', data: [
                    midDispX + x1 + (x2 - x1) * divergePoint + this.getOffset(-halfOffset, halfOffset, o),
                    midDispY + y1 + (y2 - y1) * divergePoint + this.getOffset(-halfOffset, halfOffset, o),
                    midDispX + x1 + 2 * (x2 - x1) * divergePoint + this.getOffset(-halfOffset, halfOffset, o),
                    midDispY + y1 + 2 * (y2 - y1) * divergePoint + this.getOffset(-halfOffset, halfOffset, o),
                    x2 + this.getOffset(-halfOffset, halfOffset, o),
                    y2 + this.getOffset(-halfOffset, halfOffset, o)
                ]
            });
        }
        else {
            ops.push({
                op: 'bcurveTo', data: [
                    midDispX + x1 + (x2 - x1) * divergePoint + this.getOffset(-offset, offset, o),
                    midDispY + y1 + (y2 - y1) * divergePoint + this.getOffset(-offset, offset, o),
                    midDispX + x1 + 2 * (x2 - x1) * divergePoint + this.getOffset(-offset, offset, o),
                    midDispY + y1 + 2 * (y2 - y1) * divergePoint + this.getOffset(-offset, offset, o),
                    x2 + this.getOffset(-offset, offset, o),
                    y2 + this.getOffset(-offset, offset, o)
                ]
            });
        }
        return ops;
    }
    _curve(points, closePoint, o) {
        const len = points.length;
        let ops = [];
        if (len > 3) {
            const b = [];
            const s = 1 - o.curveTightness;
            ops.push({ op: 'move', data: [points[1][0], points[1][1]] });
            for (let i = 1; (i + 2) < len; i++) {
                const cachedVertArray = points[i];
                b[0] = [cachedVertArray[0], cachedVertArray[1]];
                b[1] = [cachedVertArray[0] + (s * points[i + 1][0] - s * points[i - 1][0]) / 6, cachedVertArray[1] + (s * points[i + 1][1] - s * points[i - 1][1]) / 6];
                b[2] = [points[i + 1][0] + (s * points[i][0] - s * points[i + 2][0]) / 6, points[i + 1][1] + (s * points[i][1] - s * points[i + 2][1]) / 6];
                b[3] = [points[i + 1][0], points[i + 1][1]];
                ops.push({ op: 'bcurveTo', data: [b[1][0], b[1][1], b[2][0], b[2][1], b[3][0], b[3][1]] });
            }
            if (closePoint && closePoint.length === 2) {
                const ro = o.maxRandomnessOffset;
                ops.push({ op: 'lineTo', data: [closePoint[0] + this.getOffset(-ro, ro, o), closePoint[1] + +this.getOffset(-ro, ro, o)] });
            }
        }
        else if (len === 3) {
            ops.push({ op: 'move', data: [points[1][0], points[1][1]] });
            ops.push({
                op: 'bcurveTo', data: [
                    points[1][0], points[1][1],
                    points[2][0], points[2][1],
                    points[2][0], points[2][1]
                ]
            });
        }
        else if (len === 2) {
            ops = ops.concat(this.doubleLine(points[0][0], points[0][1], points[1][0], points[1][1], o));
        }
        return ops;
    }
    _ellipse(increment, cx, cy, rx, ry, offset, overlap, o) {
        const radOffset = this.getOffset(-0.5, 0.5, o) - (Math.PI / 2);
        const points = [];
        points.push([
            this.getOffset(-offset, offset, o) + cx + 0.9 * rx * Math.cos(radOffset - increment),
            this.getOffset(-offset, offset, o) + cy + 0.9 * ry * Math.sin(radOffset - increment)
        ]);
        for (let angle = radOffset; angle < (Math.PI * 2 + radOffset - 0.01); angle = angle + increment) {
            points.push([
                this.getOffset(-offset, offset, o) + cx + rx * Math.cos(angle),
                this.getOffset(-offset, offset, o) + cy + ry * Math.sin(angle)
            ]);
        }
        points.push([
            this.getOffset(-offset, offset, o) + cx + rx * Math.cos(radOffset + Math.PI * 2 + overlap * 0.5),
            this.getOffset(-offset, offset, o) + cy + ry * Math.sin(radOffset + Math.PI * 2 + overlap * 0.5)
        ]);
        points.push([
            this.getOffset(-offset, offset, o) + cx + 0.98 * rx * Math.cos(radOffset + overlap),
            this.getOffset(-offset, offset, o) + cy + 0.98 * ry * Math.sin(radOffset + overlap)
        ]);
        points.push([
            this.getOffset(-offset, offset, o) + cx + 0.9 * rx * Math.cos(radOffset + overlap * 0.5),
            this.getOffset(-offset, offset, o) + cy + 0.9 * ry * Math.sin(radOffset + overlap * 0.5)
        ]);
        return this._curve(points, null, o);
    }
    _curveWithOffset(points, offset, o) {
        const ps = [];
        ps.push([
            points[0][0] + this.getOffset(-offset, offset, o),
            points[0][1] + this.getOffset(-offset, offset, o),
        ]);
        ps.push([
            points[0][0] + this.getOffset(-offset, offset, o),
            points[0][1] + this.getOffset(-offset, offset, o),
        ]);
        for (let i = 1; i < points.length; i++) {
            ps.push([
                points[i][0] + this.getOffset(-offset, offset, o),
                points[i][1] + this.getOffset(-offset, offset, o),
            ]);
            if (i === (points.length - 1)) {
                ps.push([
                    points[i][0] + this.getOffset(-offset, offset, o),
                    points[i][1] + this.getOffset(-offset, offset, o),
                ]);
            }
        }
        return this._curve(ps, null, o);
    }
    _arc(increment, cx, cy, rx, ry, strt, stp, offset, o) {
        const radOffset = strt + this.getOffset(-0.1, 0.1, o);
        const points = [];
        points.push([
            this.getOffset(-offset, offset, o) + cx + 0.9 * rx * Math.cos(radOffset - increment),
            this.getOffset(-offset, offset, o) + cy + 0.9 * ry * Math.sin(radOffset - increment)
        ]);
        for (let angle = radOffset; angle <= stp; angle = angle + increment) {
            points.push([
                this.getOffset(-offset, offset, o) + cx + rx * Math.cos(angle),
                this.getOffset(-offset, offset, o) + cy + ry * Math.sin(angle)
            ]);
        }
        points.push([
            cx + rx * Math.cos(stp),
            cy + ry * Math.sin(stp)
        ]);
        points.push([
            cx + rx * Math.cos(stp),
            cy + ry * Math.sin(stp)
        ]);
        return this._curve(points, null, o);
    }
    _bezierTo(x1, y1, x2, y2, x, y, path, o) {
        const ops = [];
        const ros = [o.maxRandomnessOffset || 1, (o.maxRandomnessOffset || 1) + 0.5];
        let f = [0, 0];
        for (let i = 0; i < 2; i++) {
            if (i === 0) {
                ops.push({ op: 'move', data: [path.x, path.y] });
            }
            else {
                ops.push({ op: 'move', data: [path.x + this.getOffset(-ros[0], ros[0], o), path.y + this.getOffset(-ros[0], ros[0], o)] });
            }
            f = [x + this.getOffset(-ros[i], ros[i], o), y + this.getOffset(-ros[i], ros[i], o)];
            ops.push({
                op: 'bcurveTo', data: [
                    x1 + this.getOffset(-ros[i], ros[i], o), y1 + this.getOffset(-ros[i], ros[i], o),
                    x2 + this.getOffset(-ros[i], ros[i], o), y2 + this.getOffset(-ros[i], ros[i], o),
                    f[0], f[1]
                ]
            });
        }
        path.setPosition(f[0], f[1]);
        return ops;
    }
    _processSegment(path, seg, prevSeg, o) {
        let ops = [];
        switch (seg.key) {
            case 'M':
            case 'm': {
                const delta = seg.key === 'm';
                if (seg.data.length >= 2) {
                    let x = +seg.data[0];
                    let y = +seg.data[1];
                    if (delta) {
                        x += path.x;
                        y += path.y;
                    }
                    const ro = 1 * (o.maxRandomnessOffset || 0);
                    x = x + this.getOffset(-ro, ro, o);
                    y = y + this.getOffset(-ro, ro, o);
                    path.setPosition(x, y);
                    ops.push({ op: 'move', data: [x, y] });
                }
                break;
            }
            case 'L':
            case 'l': {
                const delta = seg.key === 'l';
                if (seg.data.length >= 2) {
                    let x = +seg.data[0];
                    let y = +seg.data[1];
                    if (delta) {
                        x += path.x;
                        y += path.y;
                    }
                    ops = ops.concat(this.doubleLine(path.x, path.y, x, y, o));
                    path.setPosition(x, y);
                }
                break;
            }
            case 'H':
            case 'h': {
                const delta = seg.key === 'h';
                if (seg.data.length) {
                    let x = +seg.data[0];
                    if (delta) {
                        x += path.x;
                    }
                    ops = ops.concat(this.doubleLine(path.x, path.y, x, path.y, o));
                    path.setPosition(x, path.y);
                }
                break;
            }
            case 'V':
            case 'v': {
                const delta = seg.key === 'v';
                if (seg.data.length) {
                    let y = +seg.data[0];
                    if (delta) {
                        y += path.y;
                    }
                    ops = ops.concat(this.doubleLine(path.x, path.y, path.x, y, o));
                    path.setPosition(path.x, y);
                }
                break;
            }
            case 'Z':
            case 'z': {
                if (path.first) {
                    ops = ops.concat(this.doubleLine(path.x, path.y, path.first[0], path.first[1], o));
                    path.setPosition(path.first[0], path.first[1]);
                    path.first = null;
                }
                break;
            }
            case 'C':
            case 'c': {
                const delta = seg.key === 'c';
                if (seg.data.length >= 6) {
                    let x1 = +seg.data[0];
                    let y1 = +seg.data[1];
                    let x2 = +seg.data[2];
                    let y2 = +seg.data[3];
                    let x = +seg.data[4];
                    let y = +seg.data[5];
                    if (delta) {
                        x1 += path.x;
                        x2 += path.x;
                        x += path.x;
                        y1 += path.y;
                        y2 += path.y;
                        y += path.y;
                    }
                    const ob = this._bezierTo(x1, y1, x2, y2, x, y, path, o);
                    ops = ops.concat(ob);
                    path.bezierReflectionPoint = [x + (x - x2), y + (y - y2)];
                }
                break;
            }
            case 'S':
            case 's': {
                const delta = seg.key === 's';
                if (seg.data.length >= 4) {
                    let x2 = +seg.data[0];
                    let y2 = +seg.data[1];
                    let x = +seg.data[2];
                    let y = +seg.data[3];
                    if (delta) {
                        x2 += path.x;
                        x += path.x;
                        y2 += path.y;
                        y += path.y;
                    }
                    let x1 = x2;
                    let y1 = y2;
                    const prevKey = prevSeg ? prevSeg.key : '';
                    let ref = null;
                    if (prevKey === 'c' || prevKey === 'C' || prevKey === 's' || prevKey === 'S') {
                        ref = path.bezierReflectionPoint;
                    }
                    if (ref) {
                        x1 = ref[0];
                        y1 = ref[1];
                    }
                    const ob = this._bezierTo(x1, y1, x2, y2, x, y, path, o);
                    ops = ops.concat(ob);
                    path.bezierReflectionPoint = [x + (x - x2), y + (y - y2)];
                }
                break;
            }
            case 'Q':
            case 'q': {
                const delta = seg.key === 'q';
                if (seg.data.length >= 4) {
                    let x1 = +seg.data[0];
                    let y1 = +seg.data[1];
                    let x = +seg.data[2];
                    let y = +seg.data[3];
                    if (delta) {
                        x1 += path.x;
                        x += path.x;
                        y1 += path.y;
                        y += path.y;
                    }
                    const offset1 = 1 * (1 + o.roughness * 0.2);
                    const offset2 = 1.5 * (1 + o.roughness * 0.22);
                    ops.push({ op: 'move', data: [path.x + this.getOffset(-offset1, offset1, o), path.y + this.getOffset(-offset1, offset1, o)] });
                    let f = [x + this.getOffset(-offset1, offset1, o), y + this.getOffset(-offset1, offset1, o)];
                    ops.push({
                        op: 'qcurveTo', data: [
                            x1 + this.getOffset(-offset1, offset1, o), y1 + this.getOffset(-offset1, offset1, o),
                            f[0], f[1]
                        ]
                    });
                    ops.push({ op: 'move', data: [path.x + this.getOffset(-offset2, offset2, o), path.y + this.getOffset(-offset2, offset2, o)] });
                    f = [x + this.getOffset(-offset2, offset2, o), y + this.getOffset(-offset2, offset2, o)];
                    ops.push({
                        op: 'qcurveTo', data: [
                            x1 + this.getOffset(-offset2, offset2, o), y1 + this.getOffset(-offset2, offset2, o),
                            f[0], f[1]
                        ]
                    });
                    path.setPosition(f[0], f[1]);
                    path.quadReflectionPoint = [x + (x - x1), y + (y - y1)];
                }
                break;
            }
            case 'T':
            case 't': {
                const delta = seg.key === 't';
                if (seg.data.length >= 2) {
                    let x = +seg.data[0];
                    let y = +seg.data[1];
                    if (delta) {
                        x += path.x;
                        y += path.y;
                    }
                    let x1 = x;
                    let y1 = y;
                    const prevKey = prevSeg ? prevSeg.key : '';
                    let ref = null;
                    if (prevKey === 'q' || prevKey === 'Q' || prevKey === 't' || prevKey === 'T') {
                        ref = path.quadReflectionPoint;
                    }
                    if (ref) {
                        x1 = ref[0];
                        y1 = ref[1];
                    }
                    const offset1 = 1 * (1 + o.roughness * 0.2);
                    const offset2 = 1.5 * (1 + o.roughness * 0.22);
                    ops.push({ op: 'move', data: [path.x + this.getOffset(-offset1, offset1, o), path.y + this.getOffset(-offset1, offset1, o)] });
                    let f = [x + this.getOffset(-offset1, offset1, o), y + this.getOffset(-offset1, offset1, o)];
                    ops.push({
                        op: 'qcurveTo', data: [
                            x1 + this.getOffset(-offset1, offset1, o), y1 + this.getOffset(-offset1, offset1, o),
                            f[0], f[1]
                        ]
                    });
                    ops.push({ op: 'move', data: [path.x + this.getOffset(-offset2, offset2, o), path.y + this.getOffset(-offset2, offset2, o)] });
                    f = [x + this.getOffset(-offset2, offset2, o), y + this.getOffset(-offset2, offset2, o)];
                    ops.push({
                        op: 'qcurveTo', data: [
                            x1 + this.getOffset(-offset2, offset2, o), y1 + this.getOffset(-offset2, offset2, o),
                            f[0], f[1]
                        ]
                    });
                    path.setPosition(f[0], f[1]);
                    path.quadReflectionPoint = [x + (x - x1), y + (y - y1)];
                }
                break;
            }
            case 'A':
            case 'a': {
                const delta = seg.key === 'a';
                if (seg.data.length >= 7) {
                    const rx = +seg.data[0];
                    const ry = +seg.data[1];
                    const angle = +seg.data[2];
                    const largeArcFlag = +seg.data[3];
                    const sweepFlag = +seg.data[4];
                    let x = +seg.data[5];
                    let y = +seg.data[6];
                    if (delta) {
                        x += path.x;
                        y += path.y;
                    }
                    if (x === path.x && y === path.y) {
                        break;
                    }
                    if (rx === 0 || ry === 0) {
                        ops = ops.concat(this.doubleLine(path.x, path.y, x, y, o));
                        path.setPosition(x, y);
                    }
                    else {
                        for (let i = 0; i < 1; i++) {
                            const arcConverter = new RoughArcConverter([path.x, path.y], [x, y], [rx, ry], angle, largeArcFlag ? true : false, sweepFlag ? true : false);
                            let segment = arcConverter.getNextSegment();
                            while (segment) {
                                const ob = this._bezierTo(segment.cp1[0], segment.cp1[1], segment.cp2[0], segment.cp2[1], segment.to[0], segment.to[1], path, o);
                                ops = ops.concat(ob);
                                segment = arcConverter.getNextSegment();
                            }
                        }
                    }
                }
                break;
            }
            default:
                break;
        }
        return ops;
    }
}
