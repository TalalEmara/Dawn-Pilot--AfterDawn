import React from "react";

/// <reference types="react" />

declare module "aframe" {
  // Empty module declaration to allow import
}

type AFrameComponentAttributes = {
  position?: string;
  rotation?: string;
  scale?: string;
  color?: string;
  animation?: string;
  material?: string;
  geometry?: string;
  visible?: boolean;
  id?: string;
  class?: string;
}

declare namespace JSX {
  interface IntrinsicElements {
    "a-scene": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        embedded?: boolean;
        vr?: boolean;
        renderer?: string;
      },
      HTMLElement
    >;
    "a-box": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-camera": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-circle": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-cylinder": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-entity": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-sky": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-sphere": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-plane": React.DetailedHTMLProps<AFrameComponentAttributes, HTMLElement>;
    "a-light": React.DetailedHTMLProps<
      AFrameComponentAttributes & {
        type?: 'ambient' | 'directional' | 'hemisphere' | 'point' | 'spot';
        intensity?: number;
      },
      HTMLElement
    >;
  }
}