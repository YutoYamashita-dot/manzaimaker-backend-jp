import SwiftUI
import SpriteKit
import UIKit

struct ConteSpriteOverlay: UIViewRepresentable {
    let left: ConteRoleCostume?
    let right: ConteRoleCostume?
    let activeSpeaker: Int?
    let action: ManzaiActionType
    let tick: Int
    let slapTick: Int

    func makeUIView(context: Context) -> SKView {
        let view = SKView(frame: .zero)
        view.backgroundColor = .clear
        view.allowsTransparency = true
        view.isOpaque = false
        view.ignoresSiblingOrder = false
        view.isUserInteractionEnabled = false
        // SKViewの勝手な非同期60fps描画を止め、SwiftUIのupdateUIViewと完全同期させる
        let scene = ConteSpriteScene(size: CGSize(width: 390, height: 550))
        scene.backgroundColor = .clear
        scene.scaleMode = .resizeFill
        view.presentScene(scene)
        return view
    }

    func updateUIView(_ uiView: SKView, context: Context) {
        guard let scene = uiView.scene as? ConteSpriteScene else { return }
        let size = uiView.bounds.size
        guard size.width > 0 && size.height > 0 else { return }
        if scene.size != size {
            scene.size = size
        }
        scene.render(
            left: left,
            right: right,
            speaker: activeSpeaker,
            action: action,
            tick: tick,
            slapTick: slapTick
        )
    }
}

private final class ConteSpriteScene: SKScene {
    private struct ActorNodes {
        let costume: ConteRoleCostume
        let root: SKNode
        let closedMouth: SKShapeNode
        let openMouth: SKNode
        let pupils: SKNode
        let eyelids: SKNode
        let popEyes: SKNode
        let baseEyes: SKNode
        let cheeks: SKNode
        let leftArm: SKShapeNode
        let rightArm: SKShapeNode
    }

    // 左右を辞書や名前検索ではなく独立プロパティで保持し、混線を100%防ぐ
    private var leftActor: ActorNodes?
    private var rightActor: ActorNodes?
    private let stroke = UIColor(red: 0.19, green: 0.23, blue: 0.29, alpha: 1.0)

    override func didMove(to view: SKView) {
        backgroundColor = .clear
        anchorPoint = .zero
    }

    func render(
        left: ConteRoleCostume?,
        right: ConteRoleCostume?,
        speaker: Int?,
        action: ManzaiActionType,
        tick: Int,
        slapTick: Int
    ) {
        updateSide(
            side: 0,
            costume: left,
            speaker: speaker,
            action: action,
            tick: tick,
            slapTick: slapTick
        )
        updateSide(
            side: 1,
            costume: right,
            speaker: speaker,
            action: action,
            tick: tick,
            slapTick: slapTick
        )
    }

    private func updateSide(
        side: Int,
        costume: ConteRoleCostume?,
        speaker: Int?,
        action: ManzaiActionType,
        tick: Int,
        slapTick: Int
    ) {
        let currentActor = (side == 0) ? leftActor : rightActor

        guard let costume, costume.isCreature || costume.isObject else {
            currentActor?.root.removeFromParent()
            if side == 0 { leftActor = nil } else { rightActor = nil }
            return
        }

        let actor: ActorNodes
        if let existing = currentActor, existing.costume == costume {
            actor = existing
        } else {
            currentActor?.root.removeFromParent()
            let created = buildActor(costume)
            created.root.zPosition = (side == 0) ? 50 : 60
            addChild(created.root)
            if side == 0 { leftActor = created } else { rightActor = created }
            actor = created
        }

        let scale = min(max((size.height * StageCanvasView.floorRatio) / 250.0, 0.52), 0.75)
        let isTalking = (speaker != nil && speaker == side)
        let isOtherTalking = (speaker != nil && speaker != side)

        let baseX = size.width * (side == 0 ? 0.35 : 0.65)
        let baseY = size.height * (1.0 - StageCanvasView.floorRatio) + 75.0 * scale

        var x = baseX
        var y = baseY
        var rotation: CGFloat = 0.0
        var stretchY: CGFloat = 1.0

        let phase = CGFloat(tick % 24) / 24.0 * .pi * 2.0
        let blinkOn = (tick + side * 29) % 96 >= 92

        if isTalking {
            // ★ 喋っている側だけが体・腕・口を動かす
            switch action {
            case .astonished:
                y += abs(sin(phase * 1.3)) * 28.0 * scale
                stretchY = 1.08
            case .working:
                x += (side == 0 ? -1.0 : 1.0) * 12.0 * scale
                rotation = sin(phase * 2.4) * 0.08
            case .panicShake:
                x += sin(phase * 8.0) * 6.5 * scale
                rotation = sin(phase * 6.0) * 0.03
            case .stepClose:
                x += (side == 0 ? 1.0 : -1.0) * 32.0 * scale
            case .zukoke:
                rotation = (side == 0 ? -1.0 : 1.0) * 0.85
                y -= 24.0 * scale
            case .dogeza, .finalBow:
                rotation = (side == 0 ? -1.0 : 1.0) * 0.28
                y -= 16.0 * scale
            case .tsukkomiSlap, .tsukkomiPoint:
                x += (side == 0 ? 1.0 : -1.0) * (slapTick <= 5 ? 22.0 : 6.0) * scale
                rotation = sin(phase * 1.6) * 0.10
            case .questionTilt:
                rotation = sin(phase * 1.2) * 0.10
            case .poseCool:
                y += 5.0 * scale
                rotation = (side == 0 ? -1.0 : 1.0) * 0.04
            default:
                y += abs(sin(phase * 2.0)) * 3.5 * scale
            }

            // 口パク（2フレームごとに開閉をはっきり切り替え）
            let openStep = (tick / 2) % 4
            if openStep == 1 || openStep == 3 {
                actor.closedMouth.isHidden = true
                actor.openMouth.isHidden = false
                actor.openMouth.yScale = (openStep == 1) ? 1.05 : 0.75
            } else {
                actor.closedMouth.isHidden = false
                actor.openMouth.isHidden = true
            }

            actor.pupils.setScale(action == .astonished ? 1.30 : 1.06)
            actor.pupils.position.y = (action == .questionTilt) ? 2.0 : 0.0
            actor.cheeks.alpha = 0.60

            switch action {
            case .working:
                actor.rightArm.zRotation = sin(phase * 3.5) * 0.60
                actor.leftArm.zRotation = -sin(phase * 3.5) * 0.45
            case .tsukkomiSlap, .tsukkomiPoint:
                actor.rightArm.zRotation = -0.75 + sin(phase * 3.0) * 0.18
                actor.leftArm.zRotation = 0.25
            case .astonished:
                actor.rightArm.zRotation = 0.50 + abs(sin(phase * 2.2)) * 0.25
                actor.leftArm.zRotation = -0.42 - abs(sin(phase * 2.2)) * 0.18
            default:
                actor.rightArm.zRotation = sin(phase * 2.0) * 0.30
                actor.leftArm.zRotation = -sin(phase * 2.0) * 0.20
            }
        } else {
            // ★ 喋っていない側は完全に静止＆開いた口を物理的に非表示(isHidden = true)にする
            if isOtherTalking && (action == .tsukkomiSlap || action == .tsukkomiPoint) && (1...5).contains(slapTick) {
                let recoil: CGFloat = (action == .tsukkomiSlap) ? 14.0 : 8.0
                x += (side == 0 ? -1.0 : 1.0) * recoil * scale
                rotation = (side == 0 ? -0.18 : 0.18)
            }
            actor.closedMouth.isHidden = false
            actor.openMouth.isHidden = true
            actor.pupils.setScale(1.0)
            actor.pupils.position.y = 0.0
            actor.cheeks.alpha = 0.18
            actor.rightArm.zRotation = 0.0
            actor.leftArm.zRotation = 0.0
        }

        let showPopEyes = isTalking && (action == .astonished || action == .panicShake)
        actor.popEyes.isHidden = !showPopEyes
        // キャラ全体の左右反転をそのまま利用：左は右上、右は左上（相手側）。
        actor.popEyes.xScale = 1.0
        actor.baseEyes.isHidden = showPopEyes
        actor.popEyes.alpha = showPopEyes ? 1.0 : 0.0
        if showPopEyes {
            actor.pupils.alpha = 0.15
            actor.popEyes.position = CGPoint(
                x: (action == .panicShake ? sin(phase * 8.0) * 2.5 : 0.0),
                y: (action == .astonished ? abs(sin(phase * 2.0)) * 3.0 : sin(phase * 6.0) * 1.2)
            )
            actor.popEyes.setScale(action == .panicShake ? 1.08 : 1.0)
        } else {
            actor.pupils.alpha = 1.0
            actor.popEyes.position = .zero
            actor.popEyes.setScale(1.0)
        }

        actor.root.position = CGPoint(x: x, y: y)
        actor.root.xScale = scale * (side == 0 ? 1.0 : -1.0)
        actor.root.yScale = scale * stretchY
        actor.root.zRotation = rotation

        actor.eyelids.alpha = (showPopEyes || !blinkOn) ? 0.0 : 0.98
        actor.eyelids.yScale = blinkOn ? 1.0 : 0.05
    }

    @discardableResult
    private func ellipse(
        _ parent: SKNode,
        _ x: CGFloat,
        _ y: CGFloat,
        _ w: CGFloat,
        _ h: CGFloat,
        _ color: UIColor,
        outline: Bool = false,
        angle: CGFloat = 0,
        z: CGFloat = 0
    ) -> SKShapeNode {
        let n = SKShapeNode(ellipseOf: CGSize(width: w, height: h))
        n.position = CGPoint(x: x, y: y)
        n.fillColor = color
        n.strokeColor = outline ? stroke : .clear
        n.lineWidth = outline ? 2.3 : 0
        n.zRotation = angle
        n.zPosition = z
        parent.addChild(n)
        return n
    }

    @discardableResult
    private func rect(
        _ parent: SKNode,
        _ x: CGFloat,
        _ y: CGFloat,
        _ w: CGFloat,
        _ h: CGFloat,
        _ color: UIColor,
        radius: CGFloat = 8,
        z: CGFloat = 0
    ) -> SKShapeNode {
        let n = SKShapeNode(rectOf: CGSize(width: w, height: h), cornerRadius: radius)
        n.fillColor = color
        n.strokeColor = stroke
        n.lineWidth = 2
        n.position = CGPoint(x: x, y: y)
        n.zPosition = z
        parent.addChild(n)
        return n
    }

    private func path(
        _ parent: SKNode,
        _ points: [CGPoint],
        _ color: UIColor,
        width: CGFloat = 2,
        z: CGFloat = 0
    ) {
        let cg = CGMutablePath()
        if let first = points.first {
            cg.move(to: first)
            for p in points.dropFirst() { cg.addLine(to: p) }
        }
        let n = SKShapeNode(path: cg)
        n.strokeColor = color
        n.lineWidth = width
        n.lineCap = .round
        n.lineJoin = .round
        n.zPosition = z
        parent.addChild(n)
    }

    private func color(_ hex: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 255) / 255.0,
            green: CGFloat((hex >> 8) & 255) / 255.0,
            blue: CGFloat(hex & 255) / 255.0,
            alpha: 1.0
        )
    }

    private func buildActor(_ costume: ConteRoleCostume) -> ActorNodes {
        let root = SKNode()
        let bodyLayer = SKNode()
        bodyLayer.zPosition = 10
        root.addChild(bodyLayer)

        let faceLayer = SKNode()
        faceLayer.zPosition = 100
        root.addChild(faceLayer)

        let animal = costume.isCreature
        let base: UIColor
        switch costume {
        case .ANIMAL_DOG: base = color(0xCB8751)
        case .ANIMAL_CAT: base = color(0xE9B46F)
        case .ANIMAL_PANDA: base = color(0xF4F4F0)
        case .ANIMAL_GORILLA: base = color(0x464A51)
        case .ANIMAL_BEAR: base = color(0x8E6245)
        case .ANIMAL_RABBIT: base = color(0xF7EFF0)
        case .ANIMAL_BIRD_PENGUIN: base = color(0x283B47)
        case .ANIMAL_OCTOPUS: base = color(0xEF7985)
        case .ANIMAL_ALIEN: base = color(0xB0DA74)
        case .OBJECT_FRIDGE: base = color(0xD5E5ED)
        case .OBJECT_SMARTPHONE: base = color(0x2D3544)
        case .OBJECT_APPLE: base = color(0xDF4A3A)
        case .OBJECT_ONIGIRI: base = color(0xF5F2EB)
        case .OBJECT_TRAFFIC_LIGHT: base = color(0x2D3940)
        case .OBJECT_SWORD: base = color(0xC3D9E5)
        case .OBJECT_TOILET: base = color(0xE6F5FA)
        case .OBJECT_ROBOT: base = color(0x9FB9CE)
        default: base = .white
        }

        ellipse(bodyLayer, 0, -74, 89, 13, UIColor.black.withAlphaComponent(0.13), z: -5)
        let leftArmNode: SKShapeNode
        let rightArmNode: SKShapeNode

        if animal {
            ellipse(bodyLayer, -18, -62, 23, 19, base, outline: true, z: 0)
            ellipse(bodyLayer, 18, -62, 23, 19, base, outline: true, z: 0)
            ellipse(bodyLayer, 0, -13, 74, 99, base, outline: true, z: 1)
            ellipse(bodyLayer, 0, -19, 46, 57, .white.withAlphaComponent(0.21), z: 2)
            leftArmNode = ellipse(bodyLayer, -43, -11, 22, 53, base, outline: true, angle: -0.4, z: 3)
            rightArmNode = ellipse(bodyLayer, 43, -11, 22, 53, base, outline: true, angle: 0.4, z: 3)
        } else {
            rect(bodyLayer, 0, -12, 68, 109, base, radius: 12, z: 1)
            rect(bodyLayer, -23, -64, 17, 12, color(0x6B7280), radius: 5, z: 0)
            rect(bodyLayer, 23, -64, 17, 12, color(0x6B7280), radius: 5, z: 0)
            leftArmNode = rect(bodyLayer, -38, -9, 16, 39, base, radius: 6, z: 3)
            rightArmNode = rect(bodyLayer, 38, -9, 16, 39, base, radius: 6, z: 3)
        }

        switch costume {
        case .ANIMAL_DOG:
            for s in [-1.0, 1.0] {
                let dx = CGFloat(s)
                ellipse(bodyLayer, dx * 28, 53, 27, 49, base, outline: true, angle: -dx * 0.24, z: 2)
                ellipse(bodyLayer, dx * 28, 55, 13, 28, color(0xEBA89B), angle: -dx * 0.24, z: 3)
            }
            ellipse(bodyLayer, 0, 30, 79, 76, base, outline: true, z: 4)
            ellipse(bodyLayer, 0, 13, 58, 37, color(0xF6E7D0), z: 5)
            ellipse(faceLayer, 0, 22, 13, 9, color(0x2B2728), z: 5)

        case .ANIMAL_CAT:
            for s in [-1.0, 1.0] {
                let dx = CGFloat(s)
                let ear = SKShapeNode(path: CGPath(roundedRect: CGRect(x: dx * 20 - 14, y: 39, width: 27, height: 38), cornerWidth: 7, cornerHeight: 7, transform: nil))
                ear.fillColor = base
                ear.strokeColor = stroke
                ear.lineWidth = 2
                ear.zPosition = 2
                bodyLayer.addChild(ear)
                ellipse(bodyLayer, dx * 20, 53, 12, 22, color(0xEDA7AD), z: 3)
            }
            ellipse(bodyLayer, 0, 29, 82, 75, base, outline: true, z: 4)
            ellipse(bodyLayer, 0, 12, 42, 26, color(0xF3E7D8), z: 5)
            ellipse(faceLayer, 0, 21, 9, 7, color(0xC97684), z: 5)
            for s in [-1.0, 1.0] {
                for n in -1...1 {
                    let x = CGFloat(s)
                    let dy = CGFloat(n) * 6
                    path(faceLayer, [CGPoint(x: x * 14, y: 15 + dy), CGPoint(x: x * 40, y: 16 + dy * 0.7)], stroke, width: 1.4, z: 6)
                }
            }

        case .ANIMAL_PANDA:
            ellipse(bodyLayer, -28, 55, 30, 30, stroke, z: 2)
            ellipse(bodyLayer, 28, 55, 30, 30, stroke, z: 2)
            ellipse(bodyLayer, 0, 31, 88, 76, .white, outline: true, z: 4)
            ellipse(bodyLayer, -18, 34, 24, 30, stroke, angle: -0.22, z: 5)
            ellipse(bodyLayer, 18, 34, 24, 30, stroke, angle: 0.22, z: 5)
            ellipse(bodyLayer, 0, 14, 32, 22, color(0xF1F1EE), z: 5)
            ellipse(faceLayer, 0, 21, 11, 8, stroke, z: 5)

        case .ANIMAL_GORILLA:
            ellipse(bodyLayer, 0, 25, 91, 83, base, outline: true, z: 4)
            ellipse(bodyLayer, 0, 16, 66, 52, color(0x85736D), z: 5)
            ellipse(bodyLayer, 0, 10, 54, 30, color(0x9E8479), z: 6)
            ellipse(faceLayer, -6, 22, 6, 5, color(0x312F31), z: 5)
            ellipse(faceLayer, 6, 22, 6, 5, color(0x312F31), z: 5)

        case .ANIMAL_BEAR:
            ellipse(bodyLayer, -29, 53, 31, 31, base, outline: true, z: 2)
            ellipse(bodyLayer, 29, 53, 31, 31, base, outline: true, z: 2)
            ellipse(bodyLayer, 0, 29, 88, 80, base, outline: true, z: 4)
            ellipse(bodyLayer, 0, 12, 46, 32, color(0xC7A184), z: 5)
            ellipse(faceLayer, 0, 22, 13, 9, color(0x3B302F), z: 5)

        case .ANIMAL_RABBIT:
            for s in [-1.0, 1.0] {
                let dx = CGFloat(s)
                ellipse(bodyLayer, dx * 22, 73, 21, 85, base, outline: true, angle: dx * 0.13, z: 2)
                ellipse(bodyLayer, dx * 22, 76, 11, 67, color(0xEDB4C3), angle: dx * 0.13, z: 3)
            }
            ellipse(bodyLayer, 0, 29, 78, 77, base, outline: true, z: 4)
            ellipse(bodyLayer, 0, 12, 40, 26, .white, z: 5)
            ellipse(faceLayer, 0, 21, 9, 7, color(0xC97889), z: 5)

        case .ANIMAL_BIRD_PENGUIN:
            ellipse(bodyLayer, 0, 15, 84, 105, base, outline: true, z: 4)
            ellipse(bodyLayer, 0, 2, 58, 86, .white, z: 5)
            ellipse(faceLayer, 0, 22, 22, 10, color(0xF2A43A), z: 5)
            ellipse(bodyLayer, -25, -66, 32, 16, color(0xE89D37), z: 6)
            ellipse(bodyLayer, 25, -66, 32, 16, color(0xE89D37), z: 6)

        case .ANIMAL_OCTOPUS:
            ellipse(bodyLayer, 0, 28, 83, 82, base, outline: true, z: 4)
            for n in 0..<6 {
                let dx = CGFloat(n - 3) * 17
                ellipse(bodyLayer, dx, -55, 17, 64, base, outline: true, angle: dx / 100.0, z: 2)
            }

        case .ANIMAL_ALIEN:
            ellipse(bodyLayer, 0, 32, 94, 85, base, outline: true, z: 4)

        case .OBJECT_FRIDGE:
            rect(bodyLayer, 0, -7, 71, 115, color(0xE2EEF5), radius: 7, z: 4)
            path(bodyLayer, [CGPoint(x: -33, y: -12), CGPoint(x: 33, y: -12)], color(0x829EAA), width: 2.5, z: 5)

        case .OBJECT_SMARTPHONE:
            rect(bodyLayer, 0, 0, 74, 119, color(0x222F3B), radius: 11, z: 4)
            rect(bodyLayer, 0, 3, 62, 97, color(0xA6DBF8), radius: 5, z: 5)

        case .OBJECT_APPLE:
            ellipse(bodyLayer, -15, 5, 59, 89, base, outline: true, z: 4)
            ellipse(bodyLayer, 15, 5, 59, 89, base, outline: true, z: 4)
            path(bodyLayer, [CGPoint(x: 0, y: 49), CGPoint(x: 3, y: 70)], color(0x63452B), width: 5, z: 6)
            ellipse(bodyLayer, 15, 65, 29, 13, color(0x6AA85F), angle: 0.35, z: 6)

        case .OBJECT_ONIGIRI:
            let triangle = CGMutablePath()
            triangle.move(to: CGPoint(x: 0, y: 67))
            triangle.addQuadCurve(to: CGPoint(x: 43, y: -46), control: CGPoint(x: 40, y: 16))
            triangle.addQuadCurve(to: CGPoint(x: -43, y: -46), control: CGPoint(x: 0, y: -62))
            triangle.addQuadCurve(to: CGPoint(x: 0, y: 67), control: CGPoint(x: -40, y: 16))
            let shape = SKShapeNode(path: triangle)
            shape.fillColor = color(0xF6F5F0)
            shape.strokeColor = stroke
            shape.lineWidth = 2.5
            shape.zPosition = 4
            bodyLayer.addChild(shape)
            rect(bodyLayer, 0, -36, 46, 34, color(0x243B35), radius: 3, z: 5)

        case .OBJECT_TRAFFIC_LIGHT:
            rect(bodyLayer, 0, 6, 65, 114, color(0x293640), radius: 10, z: 4)
            for (i, c) in [color(0xEC5756), color(0xF3CA4F), color(0x51C482)].enumerated() {
                ellipse(bodyLayer, 0, 39 - CGFloat(i) * 32, 26, 26, c, outline: true, z: 5)
            }

        case .OBJECT_SWORD:
            let blade = CGMutablePath()
            blade.move(to: CGPoint(x: 0, y: 98))
            blade.addLine(to: CGPoint(x: 14, y: 70))
            blade.addLine(to: CGPoint(x: 16, y: -6))
            blade.addLine(to: CGPoint(x: 9, y: -28))
            blade.addLine(to: CGPoint(x: -9, y: -28))
            blade.addLine(to: CGPoint(x: -16, y: -6))
            blade.addLine(to: CGPoint(x: -14, y: 70))
            blade.closeSubpath()
            let sword = SKShapeNode(path: blade)
            sword.fillColor = color(0xD7E2EA)
            sword.strokeColor = stroke
            sword.lineWidth = 2.2
            sword.zPosition = 4
            bodyLayer.addChild(sword)

            let edgeHighlight = CGMutablePath()
            edgeHighlight.move(to: CGPoint(x: 0, y: 86))
            edgeHighlight.addLine(to: CGPoint(x: 0, y: -16))
            let edgeNode = SKShapeNode(path: edgeHighlight)
            edgeNode.strokeColor = UIColor.white.withAlphaComponent(0.92)
            edgeNode.lineWidth = 1.6
            edgeNode.zPosition = 5
            bodyLayer.addChild(edgeNode)

            rect(bodyLayer, 0, -31, 72, 12, color(0xC9A15A), radius: 4, z: 5)
            ellipse(bodyLayer, 0, -31, 12, 12, color(0x6C1B78), outline: true, z: 6)
            rect(bodyLayer, 0, -55, 14, 37, color(0x6D4C41), radius: 4, z: 5)
            rect(bodyLayer, 0, -73, 8, 12, color(0xB0BEC5), radius: 4, z: 6)

        case .OBJECT_TOILET:
            rect(bodyLayer, 0, 43, 58, 45, color(0xE7F4F9), radius: 8, z: 4)
            rect(bodyLayer, 0, 28, 52, 10, color(0xD5EAF2), radius: 5, z: 5)
            let lever = CGMutablePath()
            lever.move(to: CGPoint(x: 28, y: 46))
            lever.addLine(to: CGPoint(x: 39, y: 46))
            let leverNode = SKShapeNode(path: lever)
            leverNode.strokeColor = color(0x90A4AE)
            leverNode.lineWidth = 3
            leverNode.lineCap = .round
            leverNode.zPosition = 6
            bodyLayer.addChild(leverNode)

            ellipse(bodyLayer, 0, -2, 80, 56, color(0xF7FCFE), outline: true, z: 5)
            ellipse(bodyLayer, 0, -2, 58, 36, .white, outline: true, z: 6)
            ellipse(bodyLayer, 0, -2, 37, 22, color(0x9EDAF1), z: 7)
            rect(bodyLayer, 0, -39, 34, 44, color(0xEAF5F9), radius: 9, z: 4)
            ellipse(bodyLayer, 0, -63, 43, 18, color(0xD9EBF2), z: 3)

        case .OBJECT_ROBOT:
            rect(bodyLayer, 0, -6, 79, 88, color(0xAABFCC), radius: 11, z: 4)
            rect(bodyLayer, 0, 38, 86, 56, color(0x5B788F), radius: 12, z: 5)
            path(bodyLayer, [CGPoint(x: 0, y: 66), CGPoint(x: 0, y: 86)], stroke, width: 3, z: 6)
            ellipse(bodyLayer, 0, 89, 13, 13, color(0xF0B765), z: 7)

        default:
            break
        }

        let eyeY: CGFloat = animal ? 35 : 26
        let mouthY: CGFloat = {
            if costume == .OBJECT_TRAFFIC_LIGHT { return -42 }
            if costume == .OBJECT_ROBOT { return 22 }
            return animal ? 7 : 0
        }()

        let lidColor: UIColor = (costume == .ANIMAL_PANDA || costume == .ANIMAL_RABBIT || costume == .OBJECT_ONIGIRI) ? .white : base
        let pupilsNode = SKNode()
        pupilsNode.zPosition = 20
        let eyelidsNode = SKNode()
        eyelidsNode.zPosition = 30
        eyelidsNode.alpha = 0.0
        let baseEyesNode = SKNode()
        baseEyesNode.zPosition = 15
        let popEyesNode = SKNode()
        popEyesNode.zPosition = 40
        popEyesNode.isHidden = true
        popEyesNode.alpha = 0.0
        let cheeksNode = SKNode()
        cheeksNode.zPosition = 10
        cheeksNode.alpha = 0.18

        faceLayer.addChild(cheeksNode)
        faceLayer.addChild(baseEyesNode)
        faceLayer.addChild(pupilsNode)
        faceLayer.addChild(eyelidsNode)
        faceLayer.addChild(popEyesNode)

        for s in [-1.0, 1.0] {
            let dx = CGFloat(s) * 16.5
            ellipse(baseEyesNode, dx, eyeY, 17, 15, .white, outline: true, z: 1)
            ellipse(pupilsNode, dx, eyeY, 9.5, 11, color(0x1E293B), z: 1)
            ellipse(pupilsNode, dx - 2.2, eyeY + 3.0, 3.5, 4.0, .white, z: 2)
            ellipse(eyelidsNode, dx, eyeY + 2, 19, 14, lidColor, outline: true, z: 1)
            ellipse(cheeksNode, dx * 1.65, eyeY - 13, 13, 9, color(0xF472B6).withAlphaComponent(0.65), z: 1)

            // 両目ともキャラクターの前方斜め上へ飛び出す（右側は親ノードが反転）
            let popX = dx + 12.0
            let popY = eyeY + 19.0
            let stalk = CGMutablePath()
            stalk.move(to: CGPoint(x: dx, y: eyeY + 1.5))
            stalk.addQuadCurve(to: CGPoint(x: popX, y: popY - 6.0), control: CGPoint(x: dx + 6.0, y: eyeY + 8.0))
            let stalkNode = SKShapeNode(path: stalk)
            stalkNode.strokeColor = stroke
            stalkNode.lineWidth = 2.0
            stalkNode.lineCap = .round
            stalkNode.zPosition = 1
            popEyesNode.addChild(stalkNode)
            ellipse(popEyesNode, popX, popY, 21, 21, .white, outline: true, z: 2)
            ellipse(popEyesNode, popX + 1.4, popY, 9.6, 9.6, color(0x1E293B), z: 3)
            ellipse(popEyesNode, popX - 2.0, popY + 3.0, 3.2, 3.2, .white, z: 4)
        }

        if costume == .OBJECT_TRAFFIC_LIGHT {
            rect(faceLayer, 0, mouthY, 42, 18, color(0x3B4C58), radius: 6, z: 15)
        }

        // ① 閉じた口（黙っている時に表示する一本の線）
        let closedPath = CGMutablePath()
        closedPath.move(to: CGPoint(x: -9, y: mouthY))
        closedPath.addQuadCurve(to: CGPoint(x: 9, y: mouthY), control: CGPoint(x: 0, y: mouthY - 2.5))
        let closedMouthNode = SKShapeNode(path: closedPath)
        closedMouthNode.strokeColor = stroke
        closedMouthNode.lineWidth = 3.0
        closedMouthNode.lineCap = .round
        closedMouthNode.zPosition = 25
        faceLayer.addChild(closedMouthNode)

        // ② 開いた口（喋っている時だけ isHidden = false になる）
        let openMouthContainer = SKNode()
        openMouthContainer.position = CGPoint(x: 0, y: mouthY)
        openMouthContainer.zPosition = 26
        openMouthContainer.isHidden = true
        faceLayer.addChild(openMouthContainer)

        ellipse(openMouthContainer, 0, 0, 24, 15, color(0x4A1D24), outline: true, z: 1)
        ellipse(openMouthContainer, 0, -3.5, 14, 7, color(0xFB7185), z: 2)

        return ActorNodes(
            costume: costume,
            root: root,
            closedMouth: closedMouthNode,
            openMouth: openMouthContainer,
            pupils: pupilsNode,
            eyelids: eyelidsNode,
            popEyes: popEyesNode,
            baseEyes: baseEyesNode,
            cheeks: cheeksNode,
            leftArm: leftArmNode,
            rightArm: rightArmNode
        )
    }
}
