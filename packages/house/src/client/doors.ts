import * as THREE from 'three';
import { installProbeShader } from './probeLighting';
import { customiseGlassAndLamps } from './houseMaterials';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    DOORS,
    ROOM_DOOR_COUNT,
    doorComponentCount,
    doorFixedTargetBoxes,
    doorPartPose,
    type DoorState,
} from '../shared/doors';

let template: Promise<THREE.Group> | undefined;

type MovingAssembly = { update(fraction: number): void };

function materialBrightness(material: THREE.Material): number {
    return material instanceof THREE.MeshStandardMaterial
        ? material.color.r + material.color.g + material.color.b : Infinity;
}

function setCylinderBetween(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3): void {
    const delta=end.clone().sub(start);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.scale.set(1,Math.max(.001,delta.length()),1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
}

/** Replace the authored single garage leaf by stable graphite sections that
 * follow the same shared track poses used by collision, aiming and paint. */
function createSectionalGarage(
    model: THREE.Group,
    authoredLeaf: THREE.Object3D,
    doorIndex: number,
    generatedGeometry: THREE.BufferGeometry[],
    generatedMaterial: THREE.Material[],
): MovingAssembly {
    const definition=DOORS[doorIndex];
    const motion=definition.motion;
    if (motion?.type!=='sectional') throw new Error('Sectional garage motion metadata is missing');
    const sourceMaterials: THREE.MeshStandardMaterial[]=[];
    authoredLeaf.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials=Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material instanceof THREE.MeshStandardMaterial && !sourceMaterials.includes(material)) sourceMaterials.push(material);
    });
    const ordered=[...sourceMaterials].sort((a,b)=>materialBrightness(a)-materialBrightness(b));
    const seal=(ordered[0]?.clone() ?? new THREE.MeshStandardMaterial({color:0x020304,roughness:.55}));
    const graphite=(ordered.at(-1)?.clone() ?? new THREE.MeshStandardMaterial({color:0x15181c,metalness:.3,roughness:.45}));
    seal.side=graphite.side=THREE.DoubleSide;
    installProbeShader(seal); installProbeShader(graphite);
    generatedMaterial.push(seal,graphite);

    // The source has five large authored strips. Hiding it and rebuilding
    // twelve narrower sections makes the turn radius believable while keeping
    // its exact source PBR finish (the source contains no texture/UV mapping).
    authoredLeaf.visible=false;
    const count=doorComponentCount(doorIndex);
    const width=definition.max[0]-definition.min[0];
    const step=(definition.max[1]-definition.min[1])/count;
    const depth=definition.max[2]-definition.min[2];
    const height=Math.max(.04,step-motion.panelGap);
    const bodyGeometry=new THREE.BoxGeometry(width,height,depth);
    const faceGeometry=new THREE.BoxGeometry(width-.16,Math.max(.03,height-.12),.018);
    const seamGeometry=new THREE.BoxGeometry(width-.04,Math.max(.008,motion.panelGap*.72),depth+.018);
    generatedGeometry.push(bodyGeometry,faceGeometry,seamGeometry);
    const panels=Array.from({length:count},(_unused,partIndex) => {
        const group=new THREE.Group();
        group.name=`garage-section:${partIndex}`;
        const body=new THREE.Mesh(bodyGeometry,graphite);
        body.receiveShadow=true;
        const face=new THREE.Mesh(faceGeometry,graphite);
        face.position.z=depth*.5+.01;
        face.receiveShadow=true;
        // A dark recessed joint remains visible when closed; it rotates with
        // the section instead of floating in the doorway.
        const seam=new THREE.Mesh(seamGeometry,seal);
        seam.position.y=-step*.5+motion.panelGap*.5;
        group.add(body,face,seam);
        model.add(group);
        return group;
    });

    const railMaterial=new THREE.MeshStandardMaterial({color:0x23282d,metalness:.72,roughness:.3});
    const motorMaterial=new THREE.MeshStandardMaterial({color:0x343a40,metalness:.5,roughness:.38});
    installProbeShader(railMaterial); installProbeShader(motorMaterial);
    generatedMaterial.push(railMaterial,motorMaterial);
    const centerX=(definition.min[0]+definition.max[0])*.5;
    const centerZ=(definition.min[2]+definition.max[2])*.5;
    const radius=motion.curveRadius;
    const horizontalEnd=centerZ+motion.inward[2]*(radius+(definition.max[1]-definition.min[1])+.8);
    const trackPoints=(x:number) => {
        const points: THREE.Vector3[]=[];
        points.push(new THREE.Vector3(x,definition.min[1],centerZ));
        points.push(new THREE.Vector3(x,definition.max[1],centerZ));
        for(let sample=1;sample<=8;sample++) {
            const angle=Math.PI*.5*sample/8;
            points.push(new THREE.Vector3(
                x,
                definition.max[1]+radius*Math.sin(angle),
                centerZ+motion.inward[2]*radius*(1-Math.cos(angle)),
            ));
        }
        points.push(new THREE.Vector3(x,definition.max[1]+radius,horizontalEnd));
        return points;
    };
    for (const x of [definition.min[0]-.075,definition.max[0]+.075]) {
        const curve=new THREE.CatmullRomCurve3(trackPoints(x),false,'centripetal');
        const geometry=new THREE.TubeGeometry(curve,64,.035,6,false);
        generatedGeometry.push(geometry);
        const rail=new THREE.Mesh(geometry,railMaterial);
        rail.name='garage-sectional-guide-rail';
        rail.receiveShadow=true;
        model.add(rail);
    }
    const trolleyRailGeometry=new THREE.BoxGeometry(.065,.065,Math.abs(horizontalEnd-centerZ));
    const motorGeometry=new THREE.BoxGeometry(.65,.24,.48);
    const linkageGeometry=new THREE.CylinderGeometry(.025,.025,1,8);
    generatedGeometry.push(trolleyRailGeometry,motorGeometry,linkageGeometry);
    const trolleyRail=new THREE.Mesh(trolleyRailGeometry,railMaterial);
    trolleyRail.position.set(centerX,definition.max[1]+radius+.16,(horizontalEnd+centerZ)*.5);
    const motor=new THREE.Mesh(motorGeometry,motorMaterial);
    motor.name='garage-ceiling-motor';
    motor.position.set(centerX,definition.max[1]+radius+.17,horizontalEnd+.2);
    const linkage=new THREE.Mesh(linkageGeometry,railMaterial);
    linkage.name='garage-motor-linkage';
    model.add(trolleyRail,motor,linkage);

    const buttonMaterial=new THREE.MeshStandardMaterial({
        color:0x1f252a,metalness:.58,roughness:.32,emissive:0x2c1804,emissiveIntensity:.45,
    });
    installProbeShader(buttonMaterial);
    generatedMaterial.push(buttonMaterial);
    for(const [buttonIndex,box] of doorFixedTargetBoxes(doorIndex).entries()) {
        const size=box.max.map((value,axis)=>value-box.min[axis]);
        const geometry=new THREE.BoxGeometry(size[0],size[1],size[2]);
        generatedGeometry.push(geometry);
        const button=new THREE.Mesh(geometry,buttonMaterial);
        button.name=box.sourceName ?? `garage-control:${buttonIndex}`;
        button.position.set(
            (box.min[0]+box.max[0])*.5,
            (box.min[1]+box.max[1])*.5,
            (box.min[2]+box.max[2])*.5,
        );
        model.add(button);
    }

    return { update(fraction) {
        panels.forEach((panel,partIndex) => {
            const pose=doorPartPose(doorIndex,fraction,partIndex);
            panel.position.fromArray(pose.position);
            panel.rotation.set(pose.rotationX,pose.rotationY,pose.rotationZ);
        });
        const top=doorPartPose(doorIndex,fraction,count-1);
        const panelPoint=new THREE.Vector3().fromArray(top.position);
        const trolleyPoint=new THREE.Vector3(centerX,definition.max[1]+radius+.1,
            THREE.MathUtils.lerp(centerZ,horizontalEnd,Math.max(.08,fraction)));
        setCylinderBetween(linkage,panelPoint,trolleyPoint);
    } };
}

/** Movable leaves stay outside the static architecture batching/occlusion system. */
export function preloadDoors(): Promise<THREE.Group> {
    return template ??= new GLTFLoader().loadAsync('/models/doors.glb').then(gltf => {
        // Keep veranda glazing identical to the authored house windows.
        // Opaque finishes apply only to solid doors and entrance privacy panels.
        // Veranda glazing follows the house: alpha glass unless ?glass=transmission.
        customiseGlassAndLamps(gltf.scene, {
            transmission: new URLSearchParams(location.search).get('glass') === 'transmission',
        });
        const finishes = new Map<THREE.Material, THREE.Material>();
        const opaque = (source: THREE.Material): THREE.Material => {
            let material = finishes.get(source);
            if (material) return material;
            if (source.name === 'Rear photo / clear rear glazing') {
                finishes.set(source, source);
                installProbeShader(source);
                return source;
            }
            material = source.clone();
            material.opacity = 1;
            material.transparent = false;
            material.depthWrite = true;
            material.side = THREE.DoubleSide;
            if (material instanceof THREE.MeshStandardMaterial) {
                material.alphaMap = null;
                material.alphaTest = 0;
            }
            if (material instanceof THREE.MeshPhysicalMaterial) {
                material.transmission = 0;
                material.transmissionMap = null;
                material.roughness = Math.max(.45, material.roughness);
            }
            finishes.set(source, material);
            installProbeShader(material);
            return material;
        };
        gltf.scene.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.material = Array.isArray(object.material)
                    ? object.material.map(opaque) : opaque(object.material);
            }
        });
        return gltf.scene;
    }).catch(error => { template = undefined; throw error; });
}

export async function createDoors(parent: THREE.Object3D) {
    const model = (await preloadDoors()).clone(true);
    parent.add(model);
    model.updateWorldMatrix(true, true);
    const generatedGeometry: THREE.BufferGeometry[]=[];
    const generatedMaterial: THREE.Material[]=[];
    const assemblies = DOORS.slice(0, ROOM_DOOR_COUNT).map((definition,index): MovingAssembly => {
        const leaf = model.getObjectByName(definition.id);
        if (!leaf)
            throw new Error(`Missing door assembly: ${definition.label}`);
        leaf.traverse(object => {
            if (object instanceof THREE.Mesh) {
                // Static house shadows are baked once; avoid a stale door shadow.
                object.castShadow = false;
                object.receiveShadow = true;
            }
        });
        if (definition.motion?.type==='sectional') {
            return createSectionalGarage(model,leaf,index,generatedGeometry,generatedMaterial);
        }
        const pivot = new THREE.Group();
        pivot.position.fromArray(definition.pivot);
        model.add(pivot);
        pivot.updateWorldMatrix(true, false);
        pivot.attach(leaf);
        return { update(fraction) {
            const pose=doorPartPose(index,fraction);
            pivot.rotation.set(pose.rotationX,pose.rotationY,pose.rotationZ);
            pivot.position.fromArray(pose.position);
        } };
    });
    return {
        update(states: readonly DoorState[]) {
            assemblies.forEach((assembly, index) => assembly.update(states[index]?.fraction ?? 0));
        },
        dispose() {
            model.removeFromParent();
            generatedGeometry.forEach(geometry => geometry.dispose());
            generatedMaterial.forEach(material => material.dispose());
        },
    };
}
