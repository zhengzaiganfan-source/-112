import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { HandControlState, RepairStage } from '../types';

interface VisionControllerProps {
  onUpdate: (state: Partial<HandControlState>) => void;
  currentState: HandControlState;
}

const VisionController: React.FC<VisionControllerProps> = ({ onUpdate, currentState }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const lastVideoTime = useRef(-1);
  const requestRef = useRef<number | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  // Track stage transition time for debounce/cooldown
  const lastStageChangeTime = useRef(Date.now());

  // We use a Ref to track the current state inside the animation loop to avoid stale closures
  const stateRef = useRef(currentState);
  
  // Sync ref with props
  useEffect(() => {
    stateRef.current = currentState;
  }, [currentState]);

  // Update timestamp when stage changes
  useEffect(() => {
    lastStageChangeTime.current = Date.now();
  }, [currentState.stage]);

  // Smooth values
  const selectionCursor = useRef(0);
  const progressValues = useRef({
    assembly: 0,
    clean: 0,
    repair: 0,
    color: 0
  });

  // Initialize MediaPipe
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2 // Enable 2 hands for final stage
        });
        
        startWebcam();
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
      }
    };

    initMediaPipe();

    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: "user" } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener("loadeddata", () => {
          setIsReady(true);
          predictWebcam();
        });
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
    }
  };

  // Helper: Calculate distance
  const getDist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  };

  const predictWebcam = useCallback(() => {
    if (!handLandmarkerRef.current || !videoRef.current) return;

    const video = videoRef.current;
    
    if (video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime;
      const startTimeMs = performance.now();
      const result = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

      let update: Partial<HandControlState> = { isHandDetected: false, gestureFeedback: "" };
      const currentStage = stateRef.current.stage;

      if (result.landmarks && result.landmarks.length > 0) {
        update.isHandDetected = true;
        const hand1 = result.landmarks[0];
        const hand2 = result.landmarks.length > 1 ? result.landmarks[1] : null;
        
        // --- GESTURE LOGIC STATE MACHINE ---

        switch (currentStage) {
          case RepairStage.SELECTION: {
            // Logic: Point with index finger to select from circle (mapped to x axis)
            const indexTip = hand1[8];
            update.gestureFeedback = "请伸出食指左右移动选择瓷器";
            
            // Map X (1.0 to 0.0) to 0-5. Mirror effect means 1 is left, 0 is right visually
            // X in mediapipe: 0(left) -> 1(right). CSS mirrored.
            const rawX = 1.0 - indexTip.x; 
            selectionCursor.current += (rawX * 6 - selectionCursor.current) * 0.1; // Smooth
            
            let selectedIdx = Math.round(selectionCursor.current) % 6;
            if (selectedIdx < 0) selectedIdx = 0;
            
            update.selectedVaseIndex = selectedIdx;

            // Confirm selection: Pinch (Thumb + Index)
            const pinch = getDist(hand1[8], hand1[4]);
            
            // COOLDOWN CHECK: Prevent "OK" gesture from previous stage immediately triggering this
            const timeSinceStageChange = Date.now() - lastStageChangeTime.current;
            const COOLDOWN_MS = 2000;

            if (pinch < 0.05) {
                if (timeSinceStageChange > COOLDOWN_MS) {
                     update.stage = RepairStage.ASSEMBLY;
                } else {
                     update.gestureFeedback = "请松开手指，准备选择...";
                }
            }
            break;
          }

          case RepairStage.ASSEMBLY: {
            // Logic: Raise hand high (y < 0.3) to assemble
            const wristY = hand1[0].y;
            update.gestureFeedback = "请高举手掌，凝聚碎片";
            
            if (wristY < 0.4) {
               progressValues.current.assembly += 0.01;
            }
            
            update.assemblyProgress = Math.min(progressValues.current.assembly, 1.0);
            if (progressValues.current.assembly >= 1.0) {
              update.stage = RepairStage.BLUEPRINT;
            }
            break;
          }

          case RepairStage.BLUEPRINT: {
            // Logic: Palm Down.
            update.gestureFeedback = "掌心向下，生成数字底稿";
            
            const wrist = hand1[0];
            const middle = hand1[12];
            
            // If vertical distance is small, it's flat
            const isFlat = Math.abs(wrist.y - middle.y) < 0.1;
            
            if (isFlat) {
               update.blueprintOpacity = 1.0; 
               // Auto advance after holding 
               progressValues.current.assembly += 0.01; 
               if (progressValues.current.assembly > 1.5) { // Wait ~50 frames
                   update.stage = RepairStage.CLEANING;
               }
            }
            break;
          }

          case RepairStage.CLEANING: {
             // Logic: Index finger extended, others curled. Wipe.
             update.gestureFeedback = "伸出食指，擦拭尘土";
             
             // Check Index Extended
             const indexExt = getDist(hand1[8], hand1[5]) > 0.1;
             
             if (indexExt) {
                progressValues.current.clean += 0.01;
             }
             
             update.cleanliness = Math.min(progressValues.current.clean, 1.0);
             if (progressValues.current.clean >= 1.0) {
                 update.stage = RepairStage.CRACK_FIX;
             }
             break;
          }

          case RepairStage.CRACK_FIX: {
             // Logic: 5 fingers pinch
             update.gestureFeedback = "五指捏合，修复裂痕";
             
             const thumb = hand1[4];
             const index = hand1[8];
             const pinky = hand1[20];
             
             // Calculate average spread
             const spread = getDist(thumb, index) + getDist(thumb, pinky);
             
             if (spread < 0.1) {
                 progressValues.current.repair += 0.015;
             }
             
             update.crackRepairProgress = Math.min(progressValues.current.repair, 1.0);
             if (progressValues.current.repair >= 1.0) {
                 update.stage = RepairStage.COLORING;
             }
             break;
          }

          case RepairStage.COLORING: {
              // Logic: Hand moves from Top to Bottom (Swipe)
              update.gestureFeedback = "手掌从上向下划过，进行补色";
              
              const wristY = hand1[0].y;
              // Map hand Y (0 top -> 1 bottom) to progress
              if (wristY > progressValues.current.color) {
                  progressValues.current.color = wristY; // Latch to lowest point
              }
              
              update.coloringProgress = progressValues.current.color;
              if (progressValues.current.color > 0.8) {
                  update.stage = RepairStage.COMPLETED;
              }
              break;
          }
          
          case RepairStage.COMPLETED: {
              // Logic: Two palms up (Holding gesture)
              update.gestureFeedback = "双手掌心向上托举，完成修复";
              
              if (hand2) {
                  // Check if fingertips are above wrists (pointing up visually means tips Y < wrist Y)
                  const h1Up = hand1[12].y < hand1[0].y;
                  const h2Up = hand2[12].y < hand2[0].y;
                  
                  if (h1Up && h2Up) {
                       update.stage = RepairStage.INSPECT;
                  }
              }
              break;
          }

          case RepairStage.INSPECT: {
              // Logic: Two fists closed, move left/right to rotate
              update.gestureFeedback = "握拳旋转鉴赏，或 比OK手势 重启";
              
              // 1. Rotation Logic (Two Fists)
              if (hand2) {
                  // Check fists (fingertips close to wrist/palm base)
                  const isFist1 = getDist(hand1[8], hand1[0]) < 0.25;
                  const isFist2 = getDist(hand2[8], hand2[0]) < 0.25;
                  
                  if (isFist1 && isFist2) {
                      // Calculate center X of both hands
                      const cx = (hand1[0].x + hand2[0].x) / 2;
                      const centerX = 0.5;
                      const delta = (cx - centerX) * 5; // Sensitivity
                      
                      // Update rotation
                      update.rotationX = delta;
                  }
              }

              // 2. Restart Logic (OK Gesture)
              // OK Gesture: Thumb tip (4) touches Index tip (8). Middle(12), Ring(16), Pinky(20) extended.
              const detectOk = (lm: NormalizedLandmark[]) => {
                  const pinch = getDist(lm[4], lm[8]);
                  const midExt = getDist(lm[12], lm[0]);
                  const ringExt = getDist(lm[16], lm[0]);
                  
                  // Relaxed Heuristics: Pinch (<0.08), Extended Fingers (>0.2)
                  return pinch < 0.08 && midExt > 0.2 && ringExt > 0.2;
              };

              // Check either hand for OK gesture
              if (detectOk(hand1) || (hand2 && detectOk(hand2))) {
                  // RESET ALL STATE
                  progressValues.current = { assembly: 0, clean: 0, repair: 0, color: 0 };
                  selectionCursor.current = 0;
                  
                  update.stage = RepairStage.SELECTION;
                  update.selectedVaseIndex = 0;
                  update.assemblyProgress = 0;
                  update.blueprintOpacity = 0;
                  update.cleanliness = 0;
                  update.crackRepairProgress = 0;
                  update.coloringProgress = 0;
                  update.rotationX = 0;
                  update.rotationY = 0;
                  update.gestureFeedback = "正在重置...";
              }
              
              break;
          }
        }
      } else {
        update.gestureFeedback = "未检测到手部";
      }

      onUpdate(update);
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  }, [onUpdate]); // Removed currentState dependency to prevent loop reset

  return (
    <div className="absolute bottom-4 right-4 z-50 pointer-events-none opacity-80 overflow-hidden rounded-xl border-2 border-white/20">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-32 h-24 object-cover transform -scale-x-100" 
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-xs">
          Loading AI...
        </div>
      )}
    </div>
  );
};

export default VisionController;