import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import VaseParticles from './components/VaseParticles';
import VisionController from './components/VisionController';
import { HandControlState, RepairStage, VaseShapeType } from './types';

const VASE_TYPES: VaseShapeType[] = ['meiping', 'yuhuchun', 'tianqiuping', 'hulu', 'guanyin', 'bangchui'];
const VASE_NAMES = ['梅瓶', '玉壶春瓶', '天球瓶', '葫芦瓶', '观音尊', '棒槌瓶'];

function App() {
  const [controlState, setControlState] = useState<HandControlState>({
    stage: RepairStage.SELECTION,
    selectedVaseIndex: 0,
    assemblyProgress: 0,
    blueprintOpacity: 0,
    cleanliness: 0,
    crackRepairProgress: 0,
    coloringProgress: 0,
    rotationX: 0,
    rotationY: 0,
    isHandDetected: false,
    gestureFeedback: "Initializing..."
  });

  // Handle state updates from VisionController
  const handleUpdate = (update: Partial<HandControlState>) => {
    setControlState(prev => ({ ...prev, ...update }));
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      {/* HEADER UI */}
      <div className="absolute top-0 left-0 w-full p-8 z-10 pointer-events-none text-white/90">
        <h1 className="text-4xl font-light tracking-[0.2em] mb-2 font-serif border-b border-white/20 pb-4 inline-block">
          青花瓷 · 修复体验
        </h1>
        
        <div className="mt-4">
             <div className="text-2xl font-serif text-blue-300 tracking-wider mb-2">
                {controlState.stage === RepairStage.SELECTION && "第一步：器型选择"}
                {controlState.stage === RepairStage.ASSEMBLY && "第二步：碎片凝聚"}
                {controlState.stage === RepairStage.BLUEPRINT && "第三步：数字底稿"}
                {controlState.stage === RepairStage.CLEANING && "第四步：除尘去污"}
                {controlState.stage === RepairStage.CRACK_FIX && "第五步：裂痕修复"}
                {controlState.stage === RepairStage.COLORING && "第六步：青花补色"}
                {controlState.stage >= RepairStage.COMPLETED && "最终章：鉴赏 (OK手势重启)"}
             </div>
             
             <div className={`text-lg transition-all duration-300 ${controlState.isHandDetected ? 'text-green-400' : 'text-red-400'}`}>
                {controlState.isHandDetected ? `[ 识别指令: ${controlState.gestureFeedback} ]` : "[ 等待手势... 请正对摄像头 ]"}
             </div>
        </div>

        {/* PROGRESS BARS */}
        {controlState.stage > RepairStage.SELECTION && controlState.stage < RepairStage.COMPLETED && (
            <div className="mt-4 w-32 md:mt-8 md:w-64">
                <div className="text-[10px] md:text-xs uppercase tracking-widest text-gray-400 mb-1">当前工序进度</div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                    className="h-full bg-blue-500 transition-all duration-300 ease-out shadow-[0_0_15px_#3b82f6]"
                    style={{ width: `${
                        controlState.stage === RepairStage.ASSEMBLY ? controlState.assemblyProgress * 100 :
                        controlState.stage === RepairStage.CLEANING ? controlState.cleanliness * 100 :
                        controlState.stage === RepairStage.CRACK_FIX ? controlState.crackRepairProgress * 100 :
                        controlState.stage === RepairStage.COLORING ? controlState.coloringProgress * 100 : 100
                    }%` }}
                    ></div>
                </div>
            </div>
        )}
      </div>

      {/* BLUEPRINT SCAN OVERLAY */}
      {controlState.stage === RepairStage.BLUEPRINT && (
          <div className="absolute inset-0 z-0 pointer-events-none flex flex-col items-center justify-center">
             <div className="w-96 h-96 border border-blue-500/30 rounded-lg relative overflow-hidden bg-blue-900/10 backdrop-blur-sm">
                 {/* Moving Scan Line */}
                 <div 
                    className="absolute left-0 w-full h-[2px] bg-blue-400 shadow-[0_0_15px_#60a5fa] animate-[bounce_3s_infinite]"
                 ></div>
                 
                 <div className="absolute bottom-4 left-0 w-full text-center text-blue-300 font-mono text-xs tracking-widest animate-pulse">
                     [ 正在生成数字底稿... ]
                 </div>
             </div>
          </div>
      )}

      {/* 3D SCENE */}
      <div className="w-full h-full">
        <Canvas gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}>
          <color attach="background" args={['#050505']} />
          <PerspectiveCamera makeDefault position={[0, 0, 18]} fov={45} />
          
          <Suspense fallback={null}>
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={1.2} color="#ffffff" />
            <pointLight position={[-10, -5, -10]} intensity={0.6} color="#4455ff" />

            {/* SELECTION MODE */}
            {controlState.stage === RepairStage.SELECTION && (
               <group position={[0, -2, 0]} rotation={[0.1, 0, 0]}>
                  {VASE_TYPES.map((type, index) => {
                      const count = VASE_TYPES.length;
                      const baseAngle = (index / count) * Math.PI * 2;
                      const selectionOffset = (controlState.selectedVaseIndex / count) * Math.PI * 2;
                      const currentAngle = baseAngle - selectionOffset + (Math.PI / 2); 
                      
                      const radius = 5.0; 
                      const x = Math.cos(currentAngle) * radius;
                      const z = Math.sin(currentAngle) * radius - radius;
                      
                      return (
                        <group key={type} position={[x, 0, z]}>
                            <VaseParticles 
                                controlState={controlState} 
                                shapeType={type} 
                                isMenuMode={true} 
                                menuIndex={index}
                            />
                        </group>
                      );
                  })}
               </group>
            )}

            {/* REPAIR MODE */}
            {controlState.stage !== RepairStage.SELECTION && (
                <group position={[0, -2, 0]}>
                    <VaseParticles 
                        controlState={controlState} 
                        shapeType={VASE_TYPES[controlState.selectedVaseIndex]} 
                    />
                </group>
            )}

          </Suspense>

          <OrbitControls enabled={false} /> 
        </Canvas>
      </div>

      {/* SELECTION LABEL */}
      {controlState.stage === RepairStage.SELECTION && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-32 pointer-events-none text-center">
              <div className="text-blue-200 text-xl font-serif tracking-widest border border-blue-500/30 bg-black/50 px-6 py-2 rounded-full backdrop-blur-sm">
                 {VASE_NAMES[controlState.selectedVaseIndex]}
              </div>
              <div className="text-gray-400 text-sm mt-2">使用食指选择 · 捏合确认</div>
          </div>
      )}

      {/* VISION LOGIC */}
      <VisionController onUpdate={handleUpdate} currentState={controlState} />
    </div>
  );
}

export default App;