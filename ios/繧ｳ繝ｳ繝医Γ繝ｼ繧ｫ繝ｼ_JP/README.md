# Manzai Maker iOS

This directory contains the source code for the iOS version of Manzai Maker.

## Setup Instructions

1.  **Create a new Xcode Project**:
    -   Open Xcode and create a new "App" project.
    -   Interface: SwiftUI
    -   Language: Swift
    -   Product Name: ManzaiMaker

2.  **Add Files**:
    -   Copy the `ManzaiMaker` folder (containing `Models`, `Views`, `Services`, `ViewModels`) into your Xcode project's source directory.
    -   Ensure `ManzaiMakerApp.swift` replaces the default App file created by Xcode.

3.  **Dependencies**:
    -   No external dependencies are required. The app uses standard SwiftUI and Foundation libraries.

4.  **Configuration**:
    -   **Signing**: You will need to set up your Team and Bundle Identifier in the project settings to run on a device.
    -   **Capabilities**:
        -   **In-App Purchase**: If you implement the actual billing, you need to add the In-App Purchase capability and configure products in App Store Connect.
        -   **Network**: The app requires internet access (default in iOS).

## Project Structure

-   `ManzaiMakerApp.swift`: Entry point.
-   `Views/`: SwiftUI Views (`ContentView`, `InputView`, `ResultView`, `HistoryView`).
-   `ViewModels/`: ViewModels (`InputViewModel`).
-   `Services/`: Logic for API (`ManzaiService`), Credits (`CreditManager`), and History (`HistoryManager`).
-   `Models/`: Data models (`ManzaiModels`).

## Notes

-   **Billing**: The In-App Purchase logic in `InputViewModel.swift` is currently a placeholder. You need to integrate StoreKit 2 to handle actual purchases of `credit_100`.
-   **API**: The app connects to the same backend as the Android version (`manzaimaker-backend-jp.vercel.app`).
-   **User ID**: The app uses `UIDevice.current.identifierForVendor` as the user ID for credit tracking.
