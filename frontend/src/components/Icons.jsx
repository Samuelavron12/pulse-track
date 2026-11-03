import React from 'react';

const i = (size, d) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

export const IcGrid      = ({s=20}) => i(s, <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>);
export const IcCart      = ({s=20}) => i(s, <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>);
export const IcTrend     = ({s=20}) => i(s, <><path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="21" r="1.4"/><circle cx="18" cy="21" r="1.4"/></>);
export const IcBox       = ({s=20}) => i(s, <><path d="M21 8l-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></>);
export const IcUsers     = ({s=20}) => i(s, <><circle cx="9" cy="7" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="8" r="2.5"/><path d="M15.5 14c2.5.5 4 2.5 4 5.5"/></>);
export const IcWallet    = ({s=20}) => i(s, <><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M16 14a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/><path d="M2 10h20"/></>);
export const IcFile      = ({s=20}) => i(s, <><path d="M6 2h9l4 4v16H6z"/><path d="M15 2v4h4"/><path d="M9 12h6M9 16h6M9 9h3"/></>);
export const IcSparkles  = ({s=20}) => i(s, <><path d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9L12 18.4l1.9-5.8 5.8-1.9-5.8-1.9z"/><path d="M5 3v4M3 5h4M19 17v4M17 19h4"/></>);
export const IcZap       = ({s=20}) => i(s, <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>);
export const IcBell      = ({s=20}) => i(s, <><path d="M12 3a5 5 0 0 0-5 5v3.5c0 .7-.3 1.4-.8 1.9L5 15h14l-1.2-1.6a2.7 2.7 0 0 1-.8-1.9V8a5 5 0 0 0-5-5Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/></>);
export const IcChart     = ({s=20}) => i(s, <><path d="M4 20V10M11 20V4M18 20v-7"/><path d="M2.5 20.5h19"/></>);
export const IcCog       = ({s=20}) => i(s, <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>);
export const IcLogout    = ({s=20}) => i(s, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>);
export const IcPlus      = ({s=18}) => i(s, <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>);
export const IcX         = ({s=18}) => i(s, <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>);
export const IcCheck     = ({s=18}) => i(s, <polyline points="20 6 9 17 4 12"/>);
export const IcSearch    = ({s=18}) => i(s, <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>);
export const IcEdit      = ({s=16}) => i(s, <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>);
export const IcTrash     = ({s=16}) => i(s, <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>);
export const IcDownload  = ({s=16}) => i(s, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>);
export const IcUpload    = ({s=16}) => i(s, <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>);
export const IcSend      = ({s=16}) => i(s, <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>);
export const IcSun       = ({s=18}) => i(s, <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>);
export const IcMoon      = ({s=18}) => i(s, <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>);
export const IcMonitor   = ({s=18}) => i(s, <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>);
export const IcGlobe     = ({s=18}) => i(s, <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>);
export const IcChevDown  = ({s=16}) => i(s, <polyline points="6 9 12 15 18 9"/>);
export const IcChevRight = ({s=16}) => i(s, <polyline points="9 18 15 12 9 6"/>);
export const IcMenu      = ({s=22}) => i(s, <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>);
export const IcBarcode   = ({s=20}) => i(s, <><rect x="3" y="4" width="2" height="16"/><rect x="7" y="4" width="1" height="16"/><rect x="10" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/><rect x="18" y="4" width="3" height="16"/></>);
export const IcRefresh   = ({s=18}) => i(s, <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-9"/></>);
export const IcAlert     = ({s=18}) => i(s, <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>);
export const IcBank      = ({s=20}) => i(s, <><path d="M3 22v-9M21 22v-9M3 13h18M2 9l10-7 10 7M12 22V9"/></>);
export const IcReceipt   = ({s=20}) => i(s, <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="6" x2="12" y2="6"/></>);
export const IcArrowUp   = ({s=14}) => i(s, <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>);
export const IcArrowDown = ({s=14}) => i(s, <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>);
export const IcPrint     = ({s=18}) => i(s, <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>);
export const IcEye       = ({s=16}) => i(s, <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>);
export const IcBuilding  = ({s=20}) => i(s, <><path d="M6 2h12v20H6z"/><path d="M2 6h4v16H2z"/><path d="M18 6h4v16h-4z"/><rect x="9" y="10" width="6" height="4"/><rect x="9" y="16" width="3" height="6"/></>);
export const IcCredit    = ({s=20}) => i(s, <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>);
export const IcPhone     = ({s=18}) => i(s, <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>);
export const IcChat      = ({s=18}) => i(s, <><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.3A8.4 8.4 0 1 1 21 11.5Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.3-1.9-1-.8.7a3.6 3.6 0 0 1-1.7-1.7l.7-.8-1-1.9z"/></>);
export const IcTruck     = ({s=20}) => i(s, <><rect x="1" y="6" width="14" height="11" rx="1.5"/><path d="M15 10h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>);
export const IcCamera    = ({s=18}) => i(s, <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></>);
export const IcMore      = ({s=20}) => i(s, <><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>);
export const IcWarn      = ({s=18}) => i(s, <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>);
