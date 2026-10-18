import type { ReactNode } from "react";
import type { ExtendedFigure } from "@/lib/avatars";

const BODIES: Record<ExtendedFigure, ReactNode> = {
  fox: <><path fill="#c66d32" d="M75 78c20-22 42-13 43-3 0 10-13 22-31 27l-10-7z"/><path fill="#fff5e8" d="M105 71c8 0 13 4 13 7 0 5-7 11-14 14 3-7 1-14 1-21z"/><path fill="#c66d32" d="M44 89 31 111l13 7 17-21m18-7 18 23-13 7-18-21"/><path fill="#e7833d" d="M40 59c7-11 42-13 51 1 9 15 4 42-2 51-12 14-42 8-48-3-8-14-9-35-1-49z"/><path fill="#fff1df" d="M53 68c12 6 21 6 31 0l3 37c-11 8-24 7-34-1z"/><path fill="#603d31" d="M37 112h12l-1 13H35q-5-2 2-13zm42 0h12l7 11q1 4-4 4H80z"/></>,
  bear: <><path fill="#704b3a" d="m44 83-16 19q-6 7 1 12t12-2l13-15m31-14 18 17q6 6 1 12t-12 0L73 97"/><path fill="#88604a" d="M42 62q20-13 43 0 11 8 9 34-1 23-11 29H46q-12-11-13-30-1-22 9-33z"/><ellipse cx="65" cy="91" rx="18" ry="21" fill="#d8b99c"/><path fill="#704b3a" d="M43 116h14v12H39q-7-2 4-12zm31 0h14l8 10q1 4-5 4H73z"/></>,
  unicorn: <><path fill="#d5a1ce" d="M82 70q17-24 25-10-4 17-20 28l-8-6z"/><path fill="#fff7fb" d="M41 61q14-12 39-5 13 5 14 32 1 22-10 36H48Q34 109 35 86q0-17 6-25z"/><path fill="#d8c3e8" d="M42 56q-8-13 1-23 3 16 18 21m17-3q11-8 9-20 12 12 3 27z"/><path fill="#fff" d="M44 81q16 6 35 0l4 30q-20 12-38 0z"/><path fill="#9b79ac" d="M43 116h11v12H39q-5-2 4-12zm34 0h11l8 10q2 4-5 4H76z"/></>,
  panda: <><path fill="#252b2d" d="m42 80-17 21q-5 7 2 12t12-2l16-19m25-13 20 18q6 6 1 12t-12 0L69 96"/><path fill="#f1f1eb" d="M42 61q20-12 43 0 12 10 9 36-2 20-13 28H47q-13-11-14-30-1-22 9-34z"/><ellipse cx="65" cy="91" rx="19" ry="22" fill="#d9ded7"/><path fill="#252b2d" d="M39 115h15v13H34q-5-2 5-13zm36 0h15l8 11q1 3-5 3H73z"/></>,
  frog: <><path fill="#4b9658" d="M41 76 25 92q-7 8 0 14t13-1l20-17m22-12 21 11q8 5 4 13t-13 3L69 91"/><path fill="#6bc56c" d="M40 60q23-13 47 2 11 10 7 35-4 22-14 28H48q-13-12-14-32-1-21 6-33z"/><ellipse cx="65" cy="92" rx="19" ry="22" fill="#d8ed9a"/><path fill="#4b9658" d="M39 114q-10 5-15 13 12 3 27-1l5-10zm37 0 8 12q15 4 26 0-4-8-19-13z"/></>,
  lion: <><path fill="#9b642f" d="M74 81q17-16 27-4-3 10-20 17l-7-5z"/><path fill="#53382a" d="M94 72q15-11 18-4-3 10-17 13z"/><path fill="#c88735" d="M42 61q21-12 43 0 11 8 9 36-2 21-13 28H47q-13-11-14-31-1-21 9-33z"/><path fill="#f0c777" d="M54 68q11 7 24 0l7 39q-16 10-33 0z"/><path fill="#9b642f" d="M39 115h15v13H34q-5-2 5-13zm37 0h15l8 11q1 3-5 3H73z"/></>,
  koala: <><path fill="#626c6d" d="m42 80-17 20q-6 7 1 13t12-2l16-19m25-13 19 18q6 6 1 12t-12 0L69 96"/><path fill="#919d9e" d="M42 61q20-12 43 0 12 10 9 36-2 20-13 28H47q-13-11-14-30-1-22 9-34z"/><ellipse cx="65" cy="92" rx="19" ry="22" fill="#e1e3da"/><path fill="#626c6d" d="M39 115h15v13H34q-5-2 5-13zm36 0h15l8 11q1 3-5 3H73z"/></>
};

export function ExtendedAvatar({ figure, face }: { figure: ExtendedFigure; face: string }) {
  return (
    <span className={"cel-hero cel-extended cel-extended-" + figure} aria-hidden="true">
      <svg viewBox="0 0 128 136" focusable="false">{BODIES[figure]}</svg>
      <span className="cel-extended-face">{face}</span>
    </span>
  );
}
