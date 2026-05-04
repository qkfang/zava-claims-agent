import {
  Animation,
  ArcRotateCamera,
  CubicEase,
  EasingFunction,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

/**
 * Smoothly retargets an `ArcRotateCamera` to follow scripted scenario beats.
 *
 * Every camera move animates `target`, `radius`, `alpha`, `beta` together
 * with a cubic ease so beat transitions feel cinematic without fighting
 * the user's manual orbit input (we only animate on explicit calls).
 */
export interface CameraFraming {
  /** World-space point to focus on. */
  target: Vector3;
  /** Distance from target. */
  radius?: number;
  /** Horizontal angle (radians). */
  alpha?: number;
  /** Vertical angle (radians). */
  beta?: number;
  /** Animation duration (seconds). Defaults to 1.2s. */
  durationSec?: number;
}

const FPS = 60;

export class CameraDirector {
  /** Snapshot of the camera's "home" framing — restored on releaseFocus. */
  private readonly home: Required<Omit<CameraFraming, "durationSec">> & {
    durationSec: number;
  };

  constructor(private readonly camera: ArcRotateCamera) {
    this.home = {
      target: camera.target.clone(),
      radius: camera.radius,
      alpha: camera.alpha,
      beta: camera.beta,
      durationSec: 1.2,
    };
  }

  /** Update the snapshot of the home framing (e.g. after user customises). */
  saveHome(): void {
    this.home.target = this.camera.target.clone();
    this.home.radius = this.camera.radius;
    this.home.alpha = this.camera.alpha;
    this.home.beta = this.camera.beta;
  }

  /** Animate the camera to a new framing. */
  focus(framing: CameraFraming): void {
    const duration = framing.durationSec ?? 1.2;
    const frames = Math.max(2, Math.round(duration * FPS));

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    const animate = <T>(
      property: string,
      from: T,
      to: T,
      type: number,
    ): void => {
      const anim = new Animation(
        `cam_${property}_${Date.now()}`,
        property,
        FPS,
        type,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
      );
      anim.setKeys([
        { frame: 0, value: from },
        { frame: frames, value: to },
      ]);
      anim.setEasingFunction(ease);
      this.camera.animations.push(anim);
    };

    // Reset previous animations so a new beat overrides cleanly.
    this.camera.animations = [];

    if (framing.target) {
      animate(
        "target",
        this.camera.target.clone(),
        framing.target.clone(),
        Animation.ANIMATIONTYPE_VECTOR3,
      );
    }
    if (framing.radius !== undefined) {
      animate(
        "radius",
        this.camera.radius,
        framing.radius,
        Animation.ANIMATIONTYPE_FLOAT,
      );
    }
    if (framing.alpha !== undefined) {
      animate(
        "alpha",
        this.camera.alpha,
        framing.alpha,
        Animation.ANIMATIONTYPE_FLOAT,
      );
    }
    if (framing.beta !== undefined) {
      animate(
        "beta",
        this.camera.beta,
        framing.beta,
        Animation.ANIMATIONTYPE_FLOAT,
      );
    }

    this.camera.getScene().beginAnimation(this.camera, 0, frames, false);
  }

  /** Convenience: focus on a TransformNode's world position. */
  focusNode(
    node: TransformNode,
    opts: Omit<CameraFraming, "target"> = {},
  ): void {
    // Use absolute world position so parented characters animate correctly.
    node.computeWorldMatrix(true);
    const pos = node.getAbsolutePosition().clone();
    // Aim a touch above feet so the head sits in frame.
    pos.y += 1.2;
    this.focus({ ...opts, target: pos });
  }

  /** Animate back to the saved home framing. */
  releaseFocus(durationSec = 1.4): void {
    this.focus({
      target: this.home.target.clone(),
      radius: this.home.radius,
      alpha: this.home.alpha,
      beta: this.home.beta,
      durationSec,
    });
  }
}
