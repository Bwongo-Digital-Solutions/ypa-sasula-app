import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { StatusBar } from "expo-status-bar";

const API = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
// This branch is a dedicated test build: bypass the credential screen and auto-enter through the backend test-access endpoint.
const NO_AUTH_TEST_MODE = true;
type Role = "admin" | "staff" | "member";
type User = { id: string; displayName: string; email: string; role: Role; locationId: string | null; memberId: string | null };
type CatalogItem = { id: string; name: string; price: number; sku: string | null };
type MemberProfile = { memberNumber: string; firstName: string; lastName: string; status: string; discountRate: number; walletBalance: number; qrToken: string; assets: Array<{ id: string; asset_type: string; quantity: number; unit: string | null; notes: string | null }> };

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testRole, setTestRole] = useState<Role>("admin");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [qrToken, setQrToken] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile_money" | "bank" | "wallet">("cash");
  const [verifiedMember, setVerifiedMember] = useState<{ memberNumber: string; name: string; discountRate: number } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{ receipt_number: string; gross_amount?: number | string; discount_amount: number | string; net_amount: number | string; payment_status: string; payment_method?: string; created_at?: string; member_name?: string | null; member_number?: string | null } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const autoSignInStarted = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  const request = async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const response = await fetch(`${API}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "The request could not be completed.");
    return payload as T;
  };

  const loadWorkspace = async (activeToken: string, activeUser: User) => {
    if (activeUser.role === "member") {
      const response = await fetch(`${API}/members/me`, { headers: { Authorization: `Bearer ${activeToken}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load member card.");
      setMember(payload.member);
    } else {
      const response = await fetch(`${API}/items`, { headers: { Authorization: `Bearer ${activeToken}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load the catalog.");
      setItems(payload.items);
    }
  };

  useEffect(() => {
    if (user && token) void loadWorkspace(token, user).catch((e: unknown) => Alert.alert("Could not load account", e instanceof Error ? e.message : "Try again."));
  }, [user, token]);

  const signIn = async () => {
    setLoading(true);
    setAuthError("");
    try {
      if (!API) throw new Error("API URL is not configured in this APK. Set EXPO_PUBLIC_API_URL to your reachable webapp API URL ending in /api/v1, then rebuild.");
      const response = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(NO_AUTH_TEST_MODE ? { testRole } : { email, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sign-in failed.");
      setToken(payload.token); setUser(payload.user);
    } catch (e) {
      const message = e instanceof TypeError
        ? `Cannot reach the YPA API at ${API || "an unconfigured address"}. For a phone connected to Ubuntu, use the computer's reachable Wi-Fi/hotspot IP (not localhost), make sure the API is running on port 4000, and allow the phone through the firewall.`
        : e instanceof Error ? e.message : "Check your connection.";
      if (NO_AUTH_TEST_MODE) setAuthError(message);
      else Alert.alert("Sign-in failed", message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (NO_AUTH_TEST_MODE && !autoSignInStarted.current) {
      autoSignInStarted.current = true;
      void signIn();
    }
  }, []);

  const scanCode = async (value: string) => {
    setScanned(true); setCameraOpen(false); setQrToken(value);
    try {
      const response = await request<{ member: { memberNumber: string; name: string; discountRate: number } }>("/members/verify", "POST", { qrToken: value });
      setVerifiedMember(response.member);
      Alert.alert("Member verified", `${response.member.name} · ${response.member.discountRate}% discount`);
    } catch (e) {
      setVerifiedMember(null);
      Alert.alert("Verification failed", e instanceof Error ? e.message : "This QR code could not be verified.");
    }
  };

  const recordSale = async () => {
    const selected = items.filter((item) => (counts[item.id] ?? 0) > 0).map((item) => ({ itemId: item.id, quantity: counts[item.id] }));
    if (selected.length === 0) { Alert.alert("Add an item", "Choose at least one item from the catalog."); return; }
    if (qrToken && !verifiedMember) { Alert.alert("Verify member", "Scan a valid member QR code before applying a discount."); return; }
    setLoading(true);
    try {
      const result = await request<{ transaction: { receipt_number: string; gross_amount?: number | string; net_amount: number | string; payment_status: string; discount_amount: number | string; created_at?: string } }>("/transactions", "POST", {
        ...(verifiedMember ? { qrToken } : {}), paymentMethod, items: selected
      });
      setLastReceipt({ ...result.transaction, payment_method: paymentMethod, member_name: verifiedMember?.name ?? null, member_number: verifiedMember?.memberNumber ?? null });
      const pendingNote = result.transaction.payment_status === "pending" ? "\nPayment status: PENDING — verify settlement with the provider before releasing the order." : "";
      Alert.alert(result.transaction.payment_status === "pending" ? "Payment pending" : "Sale recorded", `${result.transaction.receipt_number}\nDiscount: UGX ${Number(result.transaction.discount_amount).toLocaleString()}\nNet: UGX ${Number(result.transaction.net_amount).toLocaleString()}${pendingNote}`);
      setCounts({}); setQrToken(""); setVerifiedMember(null); setScanned(false);
    } catch (e) { Alert.alert("Sale not recorded", e instanceof Error ? e.message : "Try again."); }
    finally { setLoading(false); }
  };

  const signOut = () => { setToken(""); setUser(null); setMember(null); setItems([]); setVerifiedMember(null); setQrToken(""); setCounts({}); setLastReceipt(null); };

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <View style={styles.brandRow}><Image source={require("./assets/ypa-logo.jpg")} style={styles.brandLogo} resizeMode="contain" /><View><Text style={styles.brandTitle}>YPA Sasula</Text><Text style={styles.brandSub}>Member discounts, made visible</Text></View></View>
    {!user ? (NO_AUTH_TEST_MODE ? <View style={styles.panel}>
      <ActivityIndicator size="large" color="#039dfc" />
      <Text style={styles.heading}>{loading ? "Opening YPA Sasula…" : "Unable to connect"}</Text>
      <Text style={styles.muted}>{loading ? "Connecting automatically to the test workspace. No login is required in this build." : authError || "The test workspace could not be opened."}</Text>
      {!loading && <TouchableOpacity style={styles.primaryButton} onPress={() => void signIn()}><Text style={styles.primaryText}>Retry connection</Text></TouchableOpacity>}
      <Text style={styles.mutedSmall}>API address: {API || "NOT CONFIGURED"}{API.includes("localhost") || API.includes("127.0.0.1") ? "\\nThis address points to the phone itself, not your Ubuntu computer. Rebuild with the computer's reachable IP or a public HTTPS API URL." : ""}</Text>
      <Text style={styles.mutedSmall}>NO-AUTH TEST BUILD — for testing only, never use in production.</Text>
    </View> : <View style={styles.panel}>
      <Text style={styles.heading}>Sign in</Text><Text style={styles.muted}>Use the account provided by YPA.</Text>
      <Text style={styles.label}>Email address</Text><TextInput autoCapitalize="none" keyboardType="email-address" style={styles.input} value={email} onChangeText={setEmail} placeholder="name@example.com" />
      <Text style={styles.label}>Password</Text><View style={styles.passwordField}><TextInput secureTextEntry={!showPassword} style={styles.passwordInput} value={password} onChangeText={setPassword} placeholder="Your password" autoCapitalize="none" autoCorrect={false} /><TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword((visible) => !visible)} style={styles.passwordToggle}><Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "👁"}</Text></TouchableOpacity></View>
      <TouchableOpacity style={styles.primaryButton} onPress={() => void signIn()} disabled={loading}><Text style={styles.primaryText}>{loading ? "Signing in…" : "Sign in"}</Text></TouchableOpacity>
      <Text style={styles.mutedSmall}>For local testing, set EXPO_PUBLIC_API_URL to your computer's reachable LAN address.</Text>
    </View>) : <>
      <View style={styles.welcomeRow}><View><Text style={styles.eyebrow}>{user.role.toUpperCase()} PROFILE</Text><Text style={styles.heading}>Hello, {user.displayName.split(" ")[0]}</Text></View><TouchableOpacity onPress={signOut}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity></View>
      {user.role === "member" && member && <View style={styles.panel}>
        <Text style={styles.eyebrow}>DIGITAL MEMBERSHIP CARD</Text><Text style={styles.heading}>{member.firstName} {member.lastName}</Text><Text style={styles.memberNo}>{member.memberNumber}</Text>
        <View style={styles.qrBox}><QRCode value={member.qrToken} size={190} /></View>
        <View style={styles.statusPill}><Text style={styles.statusText}>{member.status.toUpperCase()}</Text></View>
        <View style={styles.memberStats}><View><Text style={styles.statLabel}>Your discount</Text><Text style={styles.statValue}>{member.discountRate}%</Text></View><View><Text style={styles.statLabel}>Wallet balance</Text><Text style={styles.statValue}>UGX {member.walletBalance.toLocaleString()}</Text></View></View>
        <Text style={styles.sectionTitle}>Your YPA stake</Text>
        {member.assets.length ? member.assets.map((asset) => <View style={styles.listRow} key={asset.id}><Text style={styles.itemName}>{asset.asset_type}</Text><Text style={styles.price}>{asset.quantity} {asset.unit ?? "unit"}</Text></View>) : <Text style={styles.muted}>No stake records have been added to your profile yet.</Text>}
      </View>}
      {user.role === "admin" && <View style={styles.panel}><Text style={styles.heading}>Administrator access</Text><Text style={styles.muted}>Use the web portal for live sales analytics, location-level reports, member and staff management, and the full audit trail.</Text></View>}
      {user.role === "staff" && <View style={styles.panel}>
        <Text style={styles.heading}>Record a restaurant sale</Text><Text style={styles.muted}>Scan the member card first. A discount is only applied after server-side validation.</Text>
        {cameraOpen ? (!permission?.granted ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void requestPermission()}><Text style={styles.secondaryText}>Grant camera permission</Text></TouchableOpacity> :
          <View style={styles.cameraFrame}><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => { if (!scanned) void scanCode(data); }} /><TouchableOpacity style={styles.secondaryButton} onPress={() => setCameraOpen(false)}><Text style={styles.secondaryText}>Cancel scan</Text></TouchableOpacity></View>
        ) : <TouchableOpacity style={styles.secondaryButton} onPress={() => { setScanned(false); setCameraOpen(true); }}><Text style={styles.secondaryText}>{verifiedMember ? "Scan another member" : "Scan member QR code"}</Text></TouchableOpacity>}
        {verifiedMember && <View style={styles.verifiedBox}><Text style={styles.verifiedTitle}>✓ {verifiedMember.name}</Text><Text style={styles.muted}>{verifiedMember.memberNumber} · {verifiedMember.discountRate}% member discount</Text><TouchableOpacity onPress={() => { setVerifiedMember(null); setQrToken(""); }}><Text style={styles.link}>Remove member from sale</Text></TouchableOpacity></View>}
        <Text style={styles.sectionTitle}>Items</Text>
        {items.length === 0 && <Text style={styles.muted}>No saleable items in the catalog. Ask an administrator to add items.</Text>}
        {items.map((item) => <View style={styles.listRow} key={item.id}><View style={{ flex: 1 }}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.mutedSmall}>UGX {item.price.toLocaleString()}</Text></View><TouchableOpacity style={styles.counterButton} onPress={() => setCounts((prev) => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] ?? 0) - 1) }))}><Text style={styles.counterText}>−</Text></TouchableOpacity><Text style={styles.quantity}>{counts[item.id] ?? 0}</Text><TouchableOpacity style={styles.counterButton} onPress={() => setCounts((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }))}><Text style={styles.counterText}>+</Text></TouchableOpacity></View>)}
        <Text style={styles.sectionTitle}>Payment method</Text>
        <View style={styles.paymentRow}>{(["cash", "mobile_money", "bank", "wallet"] as const).map((method) =>
          <TouchableOpacity key={method} style={[styles.paymentOption, paymentMethod === method && styles.paymentOptionActive]} onPress={() => setPaymentMethod(method)}>
            <Text style={[styles.paymentOptionText, paymentMethod === method && styles.paymentOptionTextActive]}>{method.replace("_", " ")}</Text>
          </TouchableOpacity>)}
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => void recordSale()} disabled={loading}><Text style={styles.primaryText}>{loading ? "Saving…" : "Record sale"}</Text></TouchableOpacity>
        <Text style={styles.mutedSmall}>Mobile money and bank settlement require provider integration; those methods are not marked as paid by this first version.</Text>
      </View>}
      {user.role === "staff" && lastReceipt && <View style={styles.receiptPanel}>
        <View style={styles.receiptBrand}>
          <Image source={require("./assets/ypa-logo.jpg")} style={styles.receiptLogo} resizeMode="contain" />
          <Text style={styles.receiptBrandTitle}>YOUTH PLATFORM AFRICA</Text>
          <Text style={styles.receiptBrandSubtitle}>YPA SASULA · TRANSACTION RECEIPT</Text>
        </View>
        <Text style={styles.receiptHeading}>Receipt {lastReceipt.receipt_number}</Text>
        <Text style={styles.receiptMuted}>{lastReceipt.created_at ? new Date(lastReceipt.created_at).toLocaleString() : new Date().toLocaleString()}</Text>
        <View style={styles.receiptLine}><Text style={styles.receiptLabel}>Member</Text><Text style={styles.receiptValue}>{lastReceipt.member_name || "Walk-in customer"}</Text></View>
        {lastReceipt.member_number ? <View style={styles.receiptLine}><Text style={styles.receiptLabel}>Member ID</Text><Text style={styles.receiptValue}>{lastReceipt.member_number}</Text></View> : null}
        <View style={styles.receiptLine}><Text style={styles.receiptLabel}>Payment method</Text><Text style={styles.receiptValue}>{(lastReceipt.payment_method || paymentMethod).replace("_", " ").toUpperCase()}</Text></View>
        {lastReceipt.gross_amount !== undefined ? <View style={styles.receiptLine}><Text style={styles.receiptLabel}>Gross total</Text><Text style={styles.receiptValue}>UGX {Number(lastReceipt.gross_amount).toLocaleString()}</Text></View> : null}
        <View style={styles.receiptLine}><Text style={styles.receiptLabel}>Discount</Text><Text style={styles.receiptValue}>− UGX {Number(lastReceipt.discount_amount).toLocaleString()}</Text></View>
        <View style={styles.receiptTotal}><Text style={styles.receiptTotalLabel}>NET TOTAL</Text><Text style={styles.receiptTotalValue}>UGX {Number(lastReceipt.net_amount).toLocaleString()}</Text></View>
        <View style={styles.receiptStatus}><Text style={styles.receiptStatusText}>PAYMENT: {lastReceipt.payment_status.toUpperCase()}</Text></View>
        <Text style={styles.receiptFooter}>Thank you. Keep this YPA receipt for your records.</Text>
      </View>}
    </>}
    <Text style={styles.footer}>YPA Sasula · Secure member verification</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f7f4" }, container: { padding: 20, paddingTop: 32, paddingBottom: 48, maxWidth: 620, width: "100%", alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 }, brandLogo: { width: 64, height: 62, backgroundColor: "#fff", borderRadius: 6 }, brandTitle: { fontSize: 18, color: "#039dfc", fontWeight: "800" }, brandSub: { fontSize: 11, color: "#687c70", marginTop: 3 },
  panel: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#e0e8e2", padding: 20, marginBottom: 16 }, heading: { fontSize: 24, fontWeight: "800", color: "#173c2d", marginTop: 4, marginBottom: 8 }, muted: { fontSize: 13, lineHeight: 20, color: "#69796f", marginBottom: 14 }, mutedSmall: { fontSize: 11, lineHeight: 17, color: "#78877f", marginTop: 10 }, label: { fontSize: 12, fontWeight: "700", color: "#41584a", marginTop: 15, marginBottom: 7 }, input: { height: 46, borderWidth: 1, borderColor: "#cbd7cd", borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff" }, passwordField: { height: 46, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#cbd7cd", borderRadius: 8, backgroundColor: "#fff" }, passwordInput: { flex: 1, height: 44, paddingHorizontal: 12 }, passwordToggle: { minWidth: 48, height: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, passwordToggleText: { color: "#039dfc", fontSize: 13, fontWeight: "800" },
  paymentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 4 }, paymentOption: { borderWidth: 1, borderColor: "#cbd7cd", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 }, paymentOptionActive: { backgroundColor: "#e5f5ff", borderColor: "#039dfc" }, paymentOptionText: { color: "#41584a", fontSize: 12, fontWeight: "700" }, paymentOptionTextActive: { color: "#039dfc" },
  primaryButton: { backgroundColor: "#039dfc", minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 12, marginTop: 20 }, primaryText: { color: "#fff", fontSize: 14, fontWeight: "800" }, secondaryButton: { borderWidth: 1, borderColor: "#039dfc", minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 10, marginVertical: 10 }, secondaryText: { color: "#039dfc", fontSize: 13, fontWeight: "800" },
  welcomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }, eyebrow: { letterSpacing: 1.2, color: "#6a7b70", fontSize: 10, fontWeight: "800" }, signOut: { color: "#039dfc", fontWeight: "700" }, memberNo: { color: "#597064", letterSpacing: 1.4, fontWeight: "700", fontSize: 12 },
  qrBox: { backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 18, marginVertical: 20 }, statusPill: { alignSelf: "center", backgroundColor: "#e5f5ff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }, statusText: { color: "#1c6f3b", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, memberStats: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 22, borderBottomWidth: 1, borderColor: "#e9efea", marginBottom: 20 }, statLabel: { fontSize: 11, color: "#6b7c71", marginBottom: 6 }, statValue: { fontSize: 18, color: "#173c2d", fontWeight: "800" },
  sectionTitle: { fontSize: 15, color: "#294537", fontWeight: "800", marginTop: 15, marginBottom: 5 }, listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderColor: "#edf1ed" }, itemName: { fontSize: 13, color: "#263d30", fontWeight: "700" }, price: { fontSize: 13, color: "#14543a", fontWeight: "800" }, counterButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "#b6cabc" }, counterText: { color: "#0c633f", fontWeight: "800", fontSize: 18 }, quantity: { minWidth: 20, textAlign: "center", fontWeight: "800" },
  receiptPanel: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#b8dff7", padding: 20, marginBottom: 16 },
  receiptBrand: { alignItems: "center", borderBottomWidth: 2, borderBottomColor: "#039dfc", paddingBottom: 16, marginBottom: 14 },
  receiptLogo: { width: 86, height: 74, marginBottom: 8 },
  receiptBrandTitle: { color: "#039dfc", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  receiptBrandSubtitle: { color: "#607487", fontSize: 10, marginTop: 5, textAlign: "center" },
  receiptHeading: { color: "#173c2d", fontSize: 18, fontWeight: "900", marginBottom: 4 },
  receiptMuted: { color: "#78877f", fontSize: 11, marginBottom: 12 },
  receiptLine: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#edf1ed" },
  receiptLabel: { color: "#69796f", fontSize: 12, flex: 1 },
  receiptValue: { color: "#263d30", fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  receiptTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, marginTop: 4 },
  receiptTotalLabel: { color: "#173c2d", fontSize: 12, fontWeight: "900" },
  receiptTotalValue: { color: "#039dfc", fontSize: 19, fontWeight: "900" },
  receiptStatus: { alignSelf: "flex-start", backgroundColor: "#e5f5ff", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  receiptStatusText: { color: "#1c6f3b", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  receiptFooter: { color: "#78877f", fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 17 },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1 },
  passwordToggle: { marginLeft: 10, justifyContent: "center" },
  link: { color: "#0c6a4b", textDecorationLine: "underline", fontSize: 12, fontWeight: "700", marginTop: 8 },
  footer: { color: "#83908a", textAlign: "center", fontSize: 10, marginTop: 20 }
});
