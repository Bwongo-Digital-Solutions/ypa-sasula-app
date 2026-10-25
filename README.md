# YPA Sasula — Companion Mobile App

Standalone Expo + React Native + TypeScript app for YPA members, restaurant staff and administrators. This repository contains **mobile code only**; the web portal and shared Node.js API are maintained separately in [ypa-sasula-webapp](https://github.com/Bwongo-Digital-Solutions/ypa-sasula-webapp).

## Current mobile features

- Account sign-in through the shared YPA API.
- Member profile with digital QR membership card, discount rate, wallet balance and recorded YPA stake/assets.
- Restaurant staff can scan member QR codes, verify the member with the API, select catalog items and quantities, choose a payment method, and record a sale.
- Mobile-money and bank sales are presented as pending until provider settlement is integrated and confirmed.
- Administrator role sign-in directs administrators to the web portal for full reports and user management.

## Prerequisites

- Node.js 22+
- npm 10+
- Expo Go for device smoke-testing, or Android Studio / Xcode for native development builds.
- A running YPA API and PostgreSQL database from [ypa-sasula-webapp](https://github.com/Bwongo-Digital-Solutions/ypa-sasula-webapp).

## Configure the API

Copy the environment template:

```sh
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` to the API base URL, including `/api/v1`. Choose the URL based on where the phone can reach the API:

- **Public/deployed API:** use its HTTPS URL, e.g. `https://api.example.com/api/v1`.
- **Same Wi-Fi network:** use the Ubuntu computer's reachable Wi-Fi/LAN IP, e.g. `http://192.168.1.20:4000/api/v1`.
- **Bluetooth PAN:** use the Ubuntu computer's Bluetooth PAN IP, e.g. `http://10.20.30.1:4000/api/v1`. The example address is illustrative; use the address actually assigned to the Bluetooth interface and verify that the Android phone can reach it.

For Wi-Fi or Bluetooth testing, the API must listen on an interface reachable by the phone (commonly `0.0.0.0:4000`, not only `127.0.0.1:4000`). Keep the API running, ensure host firewall rules allow the connection on the trusted local link, and test connectivity before building. A successful Bluetooth pairing/PAN connection alone does not guarantee that HTTP traffic to the API works.

Do not use `localhost` or `127.0.0.1` for a server running on the Ubuntu computer: on Android, those addresses refer to the phone itself. For deployed environments, use HTTPS. Do not expose the development API over public networks using plain HTTP.

## Run the app

```sh
npm install
npm run start
```

Use the Expo QR code to open the app on a device. For emulators, run `npm run android` or `npm run ios`.

## Type-check

```sh
npm run typecheck
```

## Important payment boundary

Choosing mobile money or bank records a pending transaction; this repository does not yet integrate MTN MoMo, Airtel Money or a bank settlement provider. Do not treat a pending payment as successful. Cash is recorded as received, and wallet purchases use the shared backend's transactional wallet debit.

SMS/push notifications, biometric fingerprint readers, member ordering/fulfilment, wallet top-ups and full reporting workflows remain follow-on work in the wider YPA system. No demo members, transactions or default credentials are shipped.

## Repository separation

- **Mobile app:** this repository.
- **Web portal + Node.js API + PostgreSQL schema:** [ypa-sasula-webapp](https://github.com/Bwongo-Digital-Solutions/ypa-sasula-webapp).

## Android signed APK releases

Read **[Android APK Signing and API Connectivity](docs/ANDROID_APK_AND_API_CONNECTIVITY.md)** for the full release-signing setup, GitHub Actions configuration, and instructions for public API, Wi-Fi/LAN, and Bluetooth PAN connectivity.

In brief, the workflow at [android-release-apk.yml](.github/workflows/android-release-apk.yml) runs when a GitHub Release is published or when manually dispatched from Actions. It builds **only a signed release APK**; it does not fall back to a debug APK. All four signing secrets and the `EXPO_PUBLIC_API_URL` repository variable must be configured or the workflow fails. The API URL is bundled into the APK at build time, so change the variable and rebuild when switching connection modes or addresses.

Keep the release keystore and passwords safe. Future upgrades of the installed Android app must use the same signing key.
