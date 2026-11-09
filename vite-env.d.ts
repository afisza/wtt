/// <reference types="vite/client" />

/** Numer wersji z `version.json` w chwili budowania (np. "2.1.0"). */
declare const __APP_VERSION__: string;
/** Stempel budowania z `version.json` (`<przebieg>-<commit>` w CI, `local-…` lokalnie). */
declare const __APP_BUILD__: string;
