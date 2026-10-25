# Android APK Signing and API Connectivity

This guide covers creating a persistent Android release signing key, configuring GitHub Actions, building and retrieving a signed APK, and choosing how the Android app reaches the YPA Sasula API.

Repository: [Bwongo-Digital-Solutions/ypa-sasula-app](https://github.com/Bwongo-Digital-Solutions/ypa-sasula-app)  
API/web backend: [Bwongo-Digital-Solutions/ypa-sasula-webapp](https://github.com/Bwongo-Digital-Solutions/ypa-sasula-webapp)  
Workflow: [`.github/workflows/android-release-apk.yml`](../.github/workflows/android-release-apk.yml)

## 1. Understand the API URL

The app reads `EXPO_PUBLIC_API_URL` at build time. The value must be the API base URL and include `/api/v1`.

Choose **one** connection mode for each APK build:

| Connection mode | Example value for `EXPO_PUBLIC_API_URL` | Requirements |
| --- | --- | --- |
| Public/deployed API | `https://api.example.com/api/v1` | Replace the example with your real, reachable HTTPS API hostname and valid TLS certificate. |
| Wi-Fi/LAN | `http://192.168.1.20:4000/api/v1` | Replace the example with Ubuntu's current Wi-Fi/LAN IP; the phone and computer must be on a network that routes between them. |
| Bluetooth PAN | `http://10.20.30.1:4000/api/v1` | Replace the example with Ubuntu's actual Bluetooth PAN IP. Bluetooth PAN must be connected, and the phone must be able to route HTTP requests to that address. |

These IP addresses are examples only. Do not copy them unless they match your actual network.

### Important localhost note

Do not use `http://localhost:4000/api/v1` or `http://127.0.0.1:4000/api/v1` in an APK installed on a physical phone when the API is running on Ubuntu. Those addresses refer to the phone itself. For an Android emulator, `http://10.0.2.2:4000/api/v1` commonly reaches the emulator host, but it is not the correct address for a physical phone.

The API is expected to use port `4000` by default. Confirm the actual port from the backend configuration if it has been changed.

## 2. Prepare the Ubuntu API for local connectivity

For Wi-Fi or Bluetooth testing:

1. Start the YPA Sasula API from the `ypa-sasula-webapp` project using its documented start command.
2. Confirm something is listening on port 4000. On Ubuntu:
   ```sh
   sudo ss -ltnp 'sport = :4000'
   ```
3. The API must listen on a reachable interface, usually `0.0.0.0:4000`, rather than only `127.0.0.1:4000`.
4. Test the API locally with a known health endpoint if the backend provides one. A response from the API root can be a 404 and does not by itself prove that the API is healthy.
5. If a host firewall is enabled, allow port 4000 only on the trusted local network/interface needed for testing. Do not expose an unsecured development API to the public internet.

Local-network APKs work only while the API is running and the phone can reach the selected IP. IP addresses can change, so update the variable and rebuild when needed.

## 3. Connection option A — Public/external API

Use this option for a deployed API that the phone can reach over the internet.

1. Deploy the backend and database using your chosen hosting setup.
2. Make the API available through a stable HTTPS hostname, for example `https://api.example.com`.
3. Verify that the API is reachable from the phone and that the API base path is correct.
4. Set the repository variable `EXPO_PUBLIC_API_URL` to the full base URL, for example `https://api.example.com/api/v1`.
5. Build a new APK as described in section 8.

Use the real API hostname, not the example. Do not use a private LAN or Bluetooth IP for a public deployment. HTTPS is strongly recommended for credentials and other sensitive API traffic.

## 4. Connection option B — Wi-Fi/LAN to Ubuntu

Use this option when the phone and Ubuntu computer are connected to the same Wi-Fi/LAN and the API is hosted on Ubuntu.

1. Connect the phone and Ubuntu to the same network.
2. Find Ubuntu's current Wi-Fi/LAN IP address, for example with:
   ```sh
   hostname -I
   ```
   Select the address for the interface reachable by the phone; do not use a Docker bridge address.
3. Confirm the API listens on `0.0.0.0:4000` (or another reachable address/port).
4. From the phone, verify reachability if possible by opening a known API health endpoint in the browser. If it fails, check the API bind address, firewall, client isolation on the Wi-Fi access point, and the endpoint path.
5. Set `EXPO_PUBLIC_API_URL` to `http://<UBUNTU-LAN-IP>:4000/api/v1`, replacing the placeholder with the actual IP.
6. Build a new APK.

This mode is for a trusted local network. Plain HTTP is not appropriate for an API exposed to the public internet.

## 5. Connection option C — Bluetooth PAN to Ubuntu

**Bluetooth pairing by itself is not enough.** The phone and computer need an active Bluetooth Personal Area Network (PAN) connection with IP connectivity.

The following is the setup used for the documented Ubuntu/Android arrangement. The Android phone must support and enable Bluetooth tethering, and the paired-device address below must be replaced if it differs on your system.

1. On Android, open **Settings → Hotspot & tethering** (menu names vary) and enable **Bluetooth tethering**.
2. Pair the phone with Ubuntu in Bluetooth settings.
3. On Ubuntu, create a NetworkManager PAN client profile. Replace the sample Bluetooth address with the phone's actual paired Bluetooth address:
   ```sh
   nmcli connection add type bluetooth con-name "YPA Bluetooth" bluetooth.type panu bluetooth.bdaddr "AA:BB:CC:DD:EE:FF" ipv4.method auto ipv6.method auto
   ```
4. Activate the connection:
   ```sh
   nmcli connection up "YPA Bluetooth"
   ```
5. Find the IP address assigned to the Bluetooth connection:
   ```sh
   nmcli -g IP4.ADDRESS connection show "YPA Bluetooth"
   ```
   Remove the subnet suffix (such as `/24`) when using the IP in a URL.
6. Confirm the API is listening on port 4000 on an address reachable over the Bluetooth interface.
7. **Verify the Android phone can reach the Ubuntu Bluetooth IP and API before building.** A successful `nmcli connection up` confirms that NetworkManager brought up the profile; it does not alone prove that the phone can route HTTP requests back to Ubuntu or that the API/firewall permits them.
8. If reachable, set `EXPO_PUBLIC_API_URL` to `http://<UBUNTU-BLUETOOTH-IP>:4000/api/v1`, replacing the placeholder with the actual IP, and build a new APK.

Bluetooth PAN details vary by Android manufacturer and version. If the phone cannot reach the Ubuntu PAN IP, do not guess an API URL or assume pairing will proxy HTTP traffic; troubleshoot PAN routing/firewall or use a supported network arrangement.

## 6. Create the persistent Android signing keystore

A release keystore is the identity used to sign Android updates. **Back it up securely and keep using the same keystore for every future update.** If it is lost or replaced, Android generally will not accept an update over an installation signed with the old key.

On Ubuntu, ensure a JDK is installed and `keytool` is available. Generate the key in a private working directory:

```sh
keytool -genkeypair -v \
  -keystore ypa-release.keystore \
  -alias ypa-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Choose strong passwords and record them in a secure password manager. Do not commit the keystore or passwords to Git.

Create the Base64 text used by GitHub Actions:

```sh
base64 -w 0 ypa-release.keystore > ypa-release.keystore.base64
```

Keep both the original keystore and its Base64 file private. The Base64 form is not encryption. Do not upload either file as a public workflow artifact or commit it to the repository.

## 7. Configure GitHub Actions secrets and variable

Open the repository's **Settings → Secrets and variables → Actions**:

- [Actions secrets](https://github.com/Bwongo-Digital-Solutions/ypa-sasula-app/settings/secrets/actions)
- [Actions variables](https://github.com/Bwongo-Digital-Solutions/ypa-sasula-app/settings/variables/actions)

Create these four **repository secrets**:

| Secret name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Entire one-line content of `ypa-release.keystore.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password chosen with `keytool` |
| `ANDROID_KEY_ALIAS` | `ypa-release` (if you used the example alias) |
| `ANDROID_KEY_PASSWORD` | Password for the key alias |

Create this **repository variable**:

| Variable name | Value |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | The selected public, Wi-Fi/LAN, or Bluetooth PAN API base URL, including `/api/v1` |

Enter only the URL in the variable value—not `EXPO_PUBLIC_API_URL=` and not quotation marks. The API URL is public app configuration, not a password; never put signing passwords in a variable.

GitHub settings links are specific to this repository. Do not share signing secrets or keystore contents in issues, pull requests, logs, or chat.

## 8. Build and download the signed APK

The workflow is [`.github/workflows/android-release-apk.yml`](../.github/workflows/android-release-apk.yml).

You can trigger it in either of these ways:

### Manual test build

1. Open the repository's **Actions** tab.
2. Select **Build Android APK for releases**.
3. Choose **Run workflow** and confirm.
4. Wait for the run to complete successfully.
5. Open the completed run and download the `YPA-Sasula-Android-...` artifact.

Workflow artifacts are retained for seven days. Download and store the APK securely if you need it later.

### Published GitHub Release

1. Set `EXPO_PUBLIC_API_URL` to the correct API URL for the APK you intend to distribute.
2. Create and publish a GitHub Release with a version tag.
3. The workflow builds the signed APK and attaches it to the release.

The workflow requires all four signing secrets and the API URL variable. It intentionally fails rather than producing a debug APK or silently using localhost. It runs `assembleRelease` and verifies the APK signature before publishing the file.

## 9. Switching between external API, Wi-Fi, and Bluetooth

The `EXPO_PUBLIC_API_URL` variable is read at build time and bundled into the APK. Changing the GitHub variable does **not** change an APK that has already been built.

To switch modes:

1. Update `EXPO_PUBLIC_API_URL` to the new API base URL.
2. Run the workflow again to build a new signed APK.
3. Install the new APK and test the connection.

Because the APK is signed with the same keystore, it can update an existing installation of the same app identity. For a phone used across multiple networks, prefer a stable HTTPS public API endpoint instead of repeatedly rebuilding for different local IP addresses.

## 10. Troubleshooting checklist

- **Workflow says a secret is missing:** Check that all four exact secret names in section 7 exist at repository level.
- **Workflow says `EXPO_PUBLIC_API_URL` is unset:** Add the repository variable and rerun the workflow.
- **App cannot connect:** Confirm the URL includes `/api/v1`, the API is running on the expected port, the phone can reach the host IP, and the API is listening on a reachable interface.
- **Works on Wi-Fi but not Bluetooth:** Recheck the active PAN connection, the actual Bluetooth IP, routes, and firewall. Bluetooth pairing alone is insufficient.
- **Works on Ubuntu but not on the phone:** `127.0.0.1` is local to each device. Use Ubuntu's reachable IP address.
- **Installed APK cannot update an older install:** The app identity and signing key must match. Keep the original keystore and alias for all releases.
- **Local IP changes:** Update the GitHub variable and rebuild the APK, or use a stable HTTPS deployment.
