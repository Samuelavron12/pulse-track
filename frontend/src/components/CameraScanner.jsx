import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/index.jsx';
import { IcX } from './Icons.jsx';

/**
 * Continuous camera barcode scanner (full-screen overlay).
 * Uses the native BarcodeDetector when the device has it, otherwise @zxing.
 * Stays open after every scan so a cashier can scan item after item; the
 * same code is ignored for 1.5 s to avoid double-adds.
 * `onScan(code)` may return a string that is shown as feedback under the camera.
 */
export default function CameraScanner({ onScan, onClose }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState([]);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stopped = false, stream = null, raf = 0, zxingControls = null;
    const last = { code: '', at: 0 };

    const handle = async code => {
      const now = Date.now();
      if (!code || (code === last.code && now - last.at < 1500)) return;
      last.code = code; last.at = now;
      try { navigator.vibrate?.(60); } catch {}
      let msg = '';
      try { msg = await onScanRef.current(code); } catch (e) { msg = e?.message || ''; }
      if (msg) setFeedback(f => [msg, ...f].slice(0, 3));
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setError(t('scan_unsupported'));
      try {
        if ('BarcodeDetector' in window) {
          const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (stopped) return stream.getTracks().forEach(tr => tr.stop());
          const v = videoRef.current; v.srcObject = stream; await v.play();
          const loop = async () => {
            if (stopped) return;
            try { const codes = await detector.detect(v); if (codes[0]) await handle(codes[0].rawValue); } catch {}
            raf = setTimeout(loop, 180);
          };
          loop();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            videoRef.current,
            result => { if (result) handle(result.getText()); }
          );
        }
      } catch (e) {
        setError(/denied|permission|NotAllowed/i.test(`${e?.name} ${e?.message}`) ? t('scan_denied') : t('scan_unsupported'));
      }
    }
    start();
    return () => {
      stopped = true; clearTimeout(raf);
      try { zxingControls?.stop(); } catch {}
      stream?.getTracks().forEach(tr => tr.stop());
    };
  }, [t]);

  return (
    <div className="scanner-overlay" role="dialog" aria-label={t('scan_camera')}>
      <div className="scanner-top">
        <div style={{ fontWeight: 700 }}>{t('scan_point')}</div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}><IcX s={14}/> {t('scan_stop')}</button>
      </div>
      <div className="scanner-stage">
        <video ref={videoRef} playsInline muted className="scanner-video"/>
        <div className="scanner-frame"><div className="scanner-line"/></div>
      </div>
      {error && <div className="scanner-msg danger">{error}</div>}
      <div className="scanner-feed">
        {feedback.map((m, i) => <div key={i} className="scanner-msg" style={{ opacity: 1 - i * 0.3 }}>{m}</div>)}
      </div>
    </div>
  );
}
