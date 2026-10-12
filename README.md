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

Set `EXPO_PUBLIC_API_URL` to the API base URL, including `/api/v1`. For an actual phone, use the computer's reachable LAN address rather than `localhost`:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api/v1
```

Replace the example IP with your development computer's current local IP. The phone and computer must be able to communicate over the network. Use HTTPS for deployed environments.

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
