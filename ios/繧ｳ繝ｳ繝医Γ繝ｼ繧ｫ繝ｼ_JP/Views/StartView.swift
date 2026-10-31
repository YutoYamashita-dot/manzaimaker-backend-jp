import SwiftUI

struct StartView: View {
    var body: some View {
        ZStack {
            // 背景画像（Assets.xcassets に "StartBackground" がある場合は表示、無ければスタイリッシュな劇場背景）
            Color(hex: "#FFF8E1")
                .ignoresSafeArea()

            Image("StartBackground")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()

            Color(hex: "#FFF4F8")
                .opacity(0.15)
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Text("")
                    .font(.system(size: 32, weight: .heavy))
                    .foregroundColor(Color(hex: "#1D4ED8"))
                    .shadow(color: .white, radius: 2)

                VStack(spacing: 16) {
                    NavigationLink {
                        MainView()
                    } label: {
                        Text("さっそくコントを作る")
                            .font(.system(size: 16, weight: .bold))
                            .frame(width: 240, height: 44)
                            .background(Color(hex: "#2563EB"))
                            .foregroundColor(.white)
                            .cornerRadius(26)
                    }

                    NavigationLink {
                        HistoryView()
                    } label: {
                        Text("保存したコント履歴")
                            .font(.system(size: 16, weight: .medium))
                            .frame(width: 240, height: 44)
                            .background(Color(hex: "#2563EB"))
                            .foregroundColor(.white)
                            .cornerRadius(26)
                    }
                }
                .padding(.top, 70)
            }
        }
    }
}
