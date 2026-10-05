"use client";

import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type {
  DroneScene,
  MotorMarker,
  SceneMeasure,
  SceneNode,
  SceneWire,
  Vec3,
} from "@/domain/categories/drone/scene";

import {
  FRONT_COLOR,
  HIGHLIGHT_COLOR,
  MATERIAL_STYLE,
  MEASURE_COLOR,
  SELECTED_EMISSIVE,
  SPIN_STYLE,
  WIRE_STYLE,
} from "./colors";

/*
 * Desenha a cena que o domínio montou (scene.ts). Não calcula medida nenhuma: só lê o JSON.
 * Desempenho: frameloop "demand" (só desenha quando algo muda); com as hélices girando, passa a
 * desenhar sempre. Nada é baixado da internet (sem fontes, texturas ou mapas de ambiente).
 */

export type DroneCanvasProps = {
  scene: DroneScene;
  /** 0 = montado, 1 = vista explodida no máximo. */
  explosao: number;
  mostrar: { fiacao: boolean; medidas: boolean; giro: boolean; animar: boolean };
  /** Nós destacados (ex.: peças do passo atual do guia). */
  destaque: ReadonlySet<string>;
  /** Peça selecionada (id do catálogo). */
  selecionado?: string;
  onSelect: (componenteId: string | undefined, noId: string) => void;
  onReady?: () => void;
};

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

export default function DroneCanvas(props: DroneCanvasProps) {
  const { scene, explosao, mostrar } = props;
  const { centro, tamanho } = useMemo(() => frameOf(scene), [scene]);
  const montado = explosao < 0.01;

  return (
    <Canvas
      frameloop={mostrar.animar ? "always" : "demand"}
      dpr={[1, 2]}
      camera={{
        position: cameraPosition(centro, tamanho),
        fov: 40,
        near: tamanho / 200,
        far: tamanho * 40,
      }}
      // preserveDrawingBuffer: deixa os testes lerem a imagem do 3D (screenshot e pixels).
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[tamanho, tamanho * 2, tamanho]} intensity={1.5} />
      <directionalLight position={[-tamanho, tamanho, -tamanho]} intensity={0.45} />
      <OrbitControls makeDefault enableDamping={false} />
      <CameraFit centro={centro} tamanho={tamanho} />

      {scene.nos.map((n) => (
        <SceneObject
          key={n.id}
          node={n}
          posicao={add(n.posicao, n.explosao, explosao)}
          destacado={props.destaque.has(n.id)}
          apagado={props.destaque.size > 0 && !props.destaque.has(n.id)}
          selecionado={n.componente_id !== undefined && n.componente_id === props.selecionado}
          animar={mostrar.animar}
          onSelect={props.onSelect}
        />
      ))}

      {mostrar.fiacao && montado && scene.fios.map((f) => <Wire key={f.id} fio={f} />)}

      {mostrar.giro &&
        scene.motores.map((m) => {
          const helice = scene.nos.find((n) => n.id === `helice-${m.canto}`);
          const desloc = helice ? helice.explosao : ([0, 0, 0] as Vec3);
          return <SpinArrow key={m.canto} motor={m} centro={add(m.centro, desloc, explosao)} />;
        })}

      {mostrar.medidas &&
        montado &&
        scene.medidas.map((m) => <Measure key={m.id} medida={m} alturaRotulo={tamanho * 0.03} />)}

      <FrontArrow frente={scene.frente} />
      <ReadySignal onReady={props.onReady} />
    </Canvas>
  );
}

function frameOf(scene: DroneScene): { centro: Vec3; tamanho: number } {
  const { min, max } = scene.limites;
  const centro: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const tamanho = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 10);
  return { centro, tamanho };
}

/** Atrás, à direita e acima do drone: a frente (−Z) fica longe da câmera, como o piloto vê. */
function cameraPosition(centro: Vec3, tamanho: number): Vec3 {
  return [centro[0] + tamanho * 0.55, centro[1] + tamanho * 0.7, centro[2] + tamanho * 1.15];
}

/** Reenquadra quando a cena muda de tamanho (ex.: trocou o frame no "experimentar"). */
function CameraFit({ centro, tamanho }: { centro: Vec3; tamanho: number }) {
  // Lê câmera e controles do estado do r3f dentro do efeito: no three.js, ajustar a câmera é
  // mudar o próprio objeto (não há versão imutável).
  const get = useThree((s) => s.get);
  const [cx, cy, cz] = centro;
  useEffect(() => {
    const { camera, controls, invalidate } = get();
    const [px, py, pz] = cameraPosition([cx, cy, cz], tamanho);
    camera.position.set(px, py, pz);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = tamanho / 200;
      camera.far = tamanho * 40;
      camera.updateProjectionMatrix();
    }
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (orbit) {
      orbit.target.set(cx, cy, cz);
      orbit.update();
    }
    invalidate();
  }, [get, cx, cy, cz, tamanho]);
  return null;
}

type ObjectProps = {
  node: SceneNode;
  posicao: Vec3;
  destacado: boolean;
  apagado: boolean;
  selecionado: boolean;
  animar: boolean;
  onSelect: DroneCanvasProps["onSelect"];
};

function SceneObject({
  node,
  posicao,
  destacado,
  apagado,
  selecionado,
  animar,
  onSelect,
}: ObjectProps) {
  const estilo = MATERIAL_STYLE[node.material];
  const cor = destacado ? HIGHLIGHT_COLOR : estilo.cor;
  const opacidade = apagado ? 0.15 : (estilo.opacidade ?? 1);
  const material = (
    <meshStandardMaterial
      color={cor}
      metalness={estilo.metal ?? 0.1}
      roughness={estilo.rugosidade ?? 0.6}
      transparent={opacidade < 1}
      opacity={opacidade}
      depthWrite={opacidade >= 1}
      emissive={selecionado ? SELECTED_EMISSIVE : "#000000"}
      emissiveIntensity={selecionado ? 0.45 : 0}
    />
  );
  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(node.componente_id, node.id);
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      document.body.style.cursor = "";
    },
  };
  const f = node.forma;

  if (f.tipo === "helice") {
    return (
      <Propeller
        posicao={posicao}
        raio={f.raio}
        pas={f.pas}
        sentido={node.gira === "horario" ? -1 : 1}
        animar={animar}
        material={material}
        opacidade={opacidade}
        cor={cor}
        handlers={handlers}
      />
    );
  }
  return (
    <mesh position={posicao} rotation={node.rotacao ?? [0, 0, 0]} {...handlers}>
      {f.tipo === "caixa" && <boxGeometry args={f.tamanho} />}
      {f.tipo === "cilindro" && <cylinderGeometry args={[f.raio, f.raio, f.altura, 32]} />}
      {f.tipo === "anel" && (
        <latheGeometry args={[ringProfile(f.raio_interno, f.raio_externo, f.altura), 64]} />
      )}
      {material}
    </mesh>
  );
}

/** Perfil (raio, altura) de um anel grosso, girado em torno de Y pela LatheGeometry. */
function ringProfile(ri: number, ro: number, h: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(ri, -h / 2),
    new THREE.Vector2(ro, -h / 2),
    new THREE.Vector2(ro, h / 2),
    new THREE.Vector2(ri, h / 2),
    new THREE.Vector2(ri, -h / 2),
  ];
}

type PropellerProps = {
  posicao: Vec3;
  raio: number;
  pas: number;
  /** +1 = anti-horário visto de cima (rotação positiva em Y); −1 = horário. */
  sentido: 1 | -1;
  animar: boolean;
  material: React.ReactElement;
  opacidade: number;
  cor: string;
  handlers: Record<string, unknown>;
};

function Propeller({
  posicao,
  raio,
  pas,
  sentido,
  animar,
  material,
  opacidade,
  cor,
  handlers,
}: PropellerProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (animar && ref.current) ref.current.rotation.y += sentido * delta * 10;
  });
  const largura = Math.max(raio * 0.16, 1.2);
  const espessura = Math.max(raio * 0.012, 0.4);
  return (
    <group position={posicao} ref={ref} {...handlers}>
      {/* Disco translúcido com o diâmetro real: mostra até onde a hélice alcança. */}
      <mesh>
        <cylinderGeometry args={[raio, raio, 0.3, 48]} />
        <meshStandardMaterial
          color={cor}
          transparent
          opacity={0.12 * opacidade}
          depthWrite={false}
        />
      </mesh>
      {/* Pás planas de propósito: o lado da borda de ataque não sai do catálogo, e uma inclinação
          desenhada poderia ensinar a montar a hélice ao contrário. O sentido fica nas setas. */}
      {Array.from({ length: pas }, (_, i) => (
        <group key={i} rotation={[0, (i * 2 * Math.PI) / pas, 0]}>
          <mesh position={[raio * 0.5, 0, 0]}>
            <boxGeometry args={[raio * 0.95, espessura, largura]} />
            {material}
          </mesh>
        </group>
      ))}
      <mesh>
        <cylinderGeometry args={[Math.max(raio * 0.08, 1), Math.max(raio * 0.08, 1), 3, 16]} />
        {material}
      </mesh>
    </group>
  );
}

function Wire({ fio }: { fio: SceneWire }) {
  return (
    <Line
      points={fio.pontos}
      color={WIRE_STYLE[fio.tipo].cor}
      lineWidth={fio.tipo === "positivo" || fio.tipo === "negativo" ? 3 : 2}
    />
  );
}

function SpinArrow({ motor, centro }: { motor: MotorMarker; centro: Vec3 }) {
  const estilo = SPIN_STYLE[motor.sentido];
  // Rotação positiva em Y = anti-horário visto de cima.
  const sinal = motor.sentido === "anti_horario" ? 1 : -1;
  const { pontos, ponta, quaternion } = useMemo(() => {
    const pts: Vec3[] = [];
    const passos = 36;
    const arco = 1.5 * Math.PI;
    for (let i = 0; i <= passos; i++) {
      const t = sinal * (i / passos) * arco;
      pts.push([
        centro[0] + motor.raio * Math.sin(t),
        centro[1],
        centro[2] + motor.raio * Math.cos(t),
      ]);
    }
    const tFinal = sinal * arco;
    const tangente = new THREE.Vector3(
      sinal * Math.cos(tFinal),
      0,
      -sinal * Math.sin(tFinal),
    ).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangente);
    return { pontos: pts, ponta: pts[pts.length - 1] ?? centro, quaternion: q };
  }, [centro, motor.raio, sinal]);
  const cone = Math.max(motor.raio * 0.18, 2);
  return (
    <group>
      <Line points={pontos} color={estilo.cor} lineWidth={2.5} />
      <mesh position={ponta} quaternion={quaternion}>
        <coneGeometry args={[cone * 0.55, cone * 1.4, 16]} />
        <meshBasicMaterial color={estilo.cor} />
      </mesh>
      {motor.numero !== undefined && (
        <Label
          texto={`${motor.numero} ${estilo.simbolo}`}
          posicao={[centro[0], centro[1] + motor.raio * 0.3, centro[2]]}
          altura={Math.max(motor.raio * 0.32, 3)}
          cor="#ffffff"
          fundo={estilo.cor}
        />
      )}
    </group>
  );
}

function Measure({ medida, alturaRotulo }: { medida: SceneMeasure; alturaRotulo: number }) {
  const meio: Vec3 = [
    (medida.de[0] + medida.ate[0]) / 2,
    (medida.de[1] + medida.ate[1]) / 2,
    (medida.de[2] + medida.ate[2]) / 2,
  ];
  return (
    <group>
      <Line
        points={[medida.de, medida.ate]}
        color={MEASURE_COLOR}
        lineWidth={1.5}
        dashed
        dashSize={4}
        gapSize={3}
      />
      <Label texto={medida.rotulo} posicao={meio} altura={alturaRotulo} />
    </group>
  );
}

function FrontArrow({ frente }: { frente: DroneScene["frente"] }) {
  const fim = add(frente.origem, frente.direcao, frente.comprimento);
  const quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...frente.direcao).normalize(),
      ),
    [frente.direcao],
  );
  const cone = Math.max(frente.comprimento * 0.18, 3);
  return (
    <group>
      <Line points={[frente.origem, fim]} color={FRONT_COLOR} lineWidth={3} />
      <mesh position={fim} quaternion={quaternion}>
        <coneGeometry args={[cone * 0.5, cone, 16]} />
        <meshBasicMaterial color={FRONT_COLOR} />
      </mesh>
      <Label
        texto="Frente"
        posicao={add(fim, frente.direcao, cone * 1.6)}
        altura={Math.max(frente.comprimento * 0.3, 4)}
        cor="#ffffff"
        fundo={FRONT_COLOR}
      />
    </group>
  );
}

/**
 * Rótulo desenhado num canvas 2D e mostrado como sprite (sempre de frente para a câmera). Não usa
 * DOM sobre o 3D nem baixa fonte: usa a fonte do sistema. Não recebe clique (não atrapalha a
 * seleção das peças atrás dele).
 */
function Label({
  texto,
  posicao,
  altura,
  cor = "#0f172a",
  fundo = "rgba(255, 255, 255, 0.92)",
}: {
  texto: string;
  posicao: Vec3;
  altura: number;
  cor?: string;
  fundo?: string;
}) {
  const textura = useMemo(() => labelTexture(texto, cor, fundo), [texto, cor, fundo]);
  useEffect(() => () => textura.dispose(), [textura]);
  const img = textura.image as HTMLCanvasElement;
  const proporcao = img.width / img.height;
  return (
    <sprite
      position={posicao}
      scale={[altura * proporcao, altura, 1]}
      renderOrder={10}
      raycast={() => null}
    >
      <spriteMaterial map={textura} depthTest={false} transparent />
    </sprite>
  );
}

function labelTexture(texto: string, cor: string, fundo: string): THREE.CanvasTexture {
  const px = 44;
  const fonte = `600 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let larguraTexto = texto.length * px * 0.6;
  if (ctx) {
    ctx.font = fonte;
    larguraTexto = ctx.measureText(texto).width;
  }
  // Mudar o tamanho do canvas apaga o desenho e o estado do contexto: medir antes, desenhar depois.
  const largura = Math.ceil(larguraTexto + px);
  const altura = Math.ceil(px * 1.5);
  canvas.width = largura;
  canvas.height = altura;
  if (ctx) {
    ctx.fillStyle = fundo;
    ctx.beginPath();
    ctx.roundRect(0, 0, largura, altura, altura * 0.3);
    ctx.fill();
    ctx.font = fonte;
    ctx.fillStyle = cor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(texto, largura / 2, altura / 2 + 2);
  }
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.minFilter = THREE.LinearFilter;
  return textura;
}

/** Avisa quando o primeiro quadro foi desenhado (os testes esperam por isso). */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const avisado = useRef(false);
  useFrame(() => {
    if (!avisado.current) {
      avisado.current = true;
      onReady?.();
    }
  });
  return null;
}
