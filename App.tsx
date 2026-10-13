import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { StatusBar } from "expo-status-bar";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
type Role = "admin" | "staff" | "member";
type User = { id: string; displayName: string; email: string; role: Role; locationId: string | null; memberId: string | null };
type CatalogItem = { id: string; name: string; price: number; sku: string | null };
type MemberProfile = { memberNumber: string; firstName: string; lastName: string; status: string; discountRate: number; walletBalance: number; qrToken: string; assets: Array<{ id: string; asset_type: string; quantity: number; unit: string | null; notes: string | null }> };

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [qrToken, setQrToken] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile_money" | "bank" | "wallet">("cash");
  const [verifiedMember, setVerifiedMember] = useState<{ memberNumber: string; name: string; discountRate: number } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
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
    try {
      const response = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sign-in failed.");
      setToken(payload.token); setUser(payload.user);
    } catch (e) { Alert.alert("Sign-in failed", e instanceof Error ? e.message : "Check your connection."); }
    finally { setLoading(false); }
  };

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
      const result = await request<{ transaction: { receipt_number: string; net_amount: number | string; payment_status: string; discount_amount: number | string } }>("/transactions", "POST", {
        ...(verifiedMember ? { qrToken } : {}), paymentMethod, items: selected
      });
      const pendingNote = result.transaction.payment_status === "pending" ? "\nPayment status: PENDING — verify settlement with the provider before releasing the order." : "";
      Alert.alert(result.transaction.payment_status === "pending" ? "Payment pending" : "Sale recorded", `${result.transaction.receipt_number}\nDiscount: UGX ${Number(result.transaction.discount_amount).toLocaleString()}\nNet: UGX ${Number(result.transaction.net_amount).toLocaleString()}${pendingNote}`);
      setCounts({}); setQrToken(""); setVerifiedMember(null); setScanned(false);
    } catch (e) { Alert.alert("Sale not recorded", e instanceof Error ? e.message : "Try again."); }
    finally { setLoading(false); }
  };

  const signOut = () => { setToken(""); setUser(null); setMember(null); setItems([]); setVerifiedMember(null); setQrToken(""); setCounts({}); };

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <View style={styles.brandRow}><Image source={require("./assets/ypa-logo.jpg")} style={styles.brandLogo} resizeMode="contain" /><View><Text style={styles.brandTitle}>YPA Sasula</Text><Text style={styles.brandSub}>Member discounts, made visible</Text></View></View>
    {!user ? <View style={styles.panel}>
      <Text style={styles.heading}>Sign in</Text><Text style={styles.muted}>Use the account provided by YPA.</Text>
      <Text style={styles.label}>Email address</Text><TextInput autoCapitalize="none" keyboardType="email-address" style={styles.input} value={email} onChangeText={setEmail} placeholder="name@example.com" />
      <Text style={styles.label}>Password</Text><TextInput secureTextEntry style={styles.input} value={password} onChangeText={setPassword} placeholder="Your password" />
      <TouchableOpacity style={styles.primaryButton} onPress={() => void signIn()} disabled={loading}><Text style={styles.primaryText}>{loading ? "Signing in…" : "Sign in"}</Text></TouchableOpacity>
      <Text style={styles.mutedSmall}>For local testing, set EXPO_PUBLIC_API_URL to your computer's reachable LAN address.</Text>
    </View> : <>
      <View style={styles.welcomeRow}><View><Text style={styles.eyebrow}>{user.role.toUpperCase()} PROFILE</Text><Text style={styles.heading}>Hello, {user.displayName.split(" ")[0]}</Text></View><TouchableOpacity onPress={signOut}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity></View>
      {user.role === "member" && member && <View style={styles.panel}>
        <Text style={styles.eyebrow}>DIGITAL MEMBERSHIP CARD</Text><Text style={styles.heading}>{member.firstName} {member.lastName}</Text><Text style={styles.memberNo}>{member.memberNumber}</Text>
        <View style={styles.qrBox}><QRCode value={member.qrToken} size={190} /></View>
        <View style={styles.statusPill}><Text style={styles.statusText}>{member.status.toUpperCase()}</Text></View>
        <View style={styles.memberStats}><View><Text style={styles.statLabel}>Your discount</Text><Text style={styles.statValue}>{member.discountRate}%</Text></View><View><Text style={styles.statLabel}>Wallet balance</Text><Text style={styles.statValue}>UGX {member.walletBalance.toLocaleString()}</Text></View></View>
        <Text style={styles.sectionTitle}>Your YPA stake</Text>
        {member.assets.length ? member.assets.map((asset) => <View style={styles.listRow} key={asset.id}><Text style={styles.itemName}>{asset.asset_type}</Text><Text style={styles.price}>{asset.quantity} {asset.unit ?? ""}</Text></View>) : <Text style={styles.muted}>No stake records have been added to your profile yet.</Text>}
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
          </TouchableOpacity>)}</View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => void recordSale()} disabled={loading}><Text style={styles.primaryText}>{loading ? "Saving…" : "Record sale"}</Text></TouchableOpacity>
        <Text style={styles.mutedSmall}>Mobile money and bank settlement require provider integration; those methods are not marked as paid by this first version.</Text>
      </View>}
    </>}
    <Text style={styles.footer}>YPA Sasula · Secure member verification</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f7f4" }, container: { padding: 20, paddingTop: 32, paddingBottom: 48, maxWidth: 620, width: "100%", alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 }, brandLogo: { width: 64, height: 62, backgroundColor: "#fff", borderRadius: 6 }, brandTitle: { fontSize: 18, color: "#039dfc", fontWeight: "800" }, brandSub: { fontSize: 11, color: "#687c70", marginTop: 3 },
  panel: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#e0e8e2", padding: 20, marginBottom: 16 }, heading: { fontSize: 24, fontWeight: "800", color: "#173c2d", marginTop: 4, marginBottom: 8 }, muted: { fontSize: 13, lineHeight: 20, color: "#69796f", marginBottom: 14 }, mutedSmall: { fontSize: 11, lineHeight: 17, color: "#78877f", marginTop: 10 }, label: { fontSize: 12, fontWeight: "700", color: "#41584a", marginTop: 15, marginBottom: 7 }, input: { height: 46, borderWidth: 1, borderColor: "#cbd7cd", borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fff" },
  primaryButton: { backgroundColor: "#039dfc", minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 12, marginTop: 20 }, primaryText: { color: "#fff", fontSize: 14, fontWeight: "800" }, secondaryButton: { borderWidth: 1, borderColor: "#039dfc", minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 10, marginVertical: 10 }, secondaryText: { color: "#039dfc", fontSize: 13, fontWeight: "800" },
  welcomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }, eyebrow: { letterSpacing: 1.2, color: "#6a7b70", fontSize: 10, fontWeight: "800" }, signOut: { color: "#039dfc", fontWeight: "700" }, memberNo: { color: "#597064", letterSpacing: 1.4, fontWeight: "700", fontSize: 12 },
  qrBox: { backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 18, marginVertical: 20 }, statusPill: { alignSelf: "center", backgroundColor: "#e5f5ff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }, statusText: { color: "#1c6f3b", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, memberStats: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 22, borderBottomWidth: 1, borderColor: "#e9efea", marginBottom: 20 }, statLabel: { fontSize: 11, color: "#6b7c71", marginBottom: 6 }, statValue: { fontSize: 18, color: "#173c2d", fontWeight: "800" },
  sectionTitle: { fontSize: 15, color: "#294537", fontWeight: "800", marginTop: 15, marginBottom: 5 }, listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderColor: "#edf1ed" }, itemName: { fontSize: 13, color: "#263d30", fontWeight: "700" }, price: { fontSize: 13, color: "#14543a", fontWeight: "800" }, counterButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "#b6cabc" }, counterText: { color: "#0c633f", fontWeight: "800", fontSize: 18 }, quantity: { minWidth: 20, textAlign: "center", fontWeight: "800" },
  paymentRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }, paymentOption: { borderWidth: 1, borderColor: "#cbd8ce", borderRadius: 7, paddingVertical: 9, paddingHorizontal: 11 }, paymentOptionActive: { borderColor: "#039dfc", backgroundColor: "#e5f5ff" }, paymentOptionText: { textTransform: "capitalize", color: "#52675a", fontSize: 11, fontWeight: "700" }, paymentOptionTextActive: { color: "#039dfc" },
  cameraFrame: { height: 340, borderRadius: 12, overflow: "hidden", marginVertical: 12 }, camera: { flex: 1 }, verifiedBox: { borderRadius: 10, backgroundColor: "#e5f5ff", padding: 14, marginTop: 10 }, verifiedTitle: { fontWeight: "800", color: "#1b683e" }, link: { color: "#0c6a4b", textDecorationLine: "underline", marginTop: 8, fontSize: 12 }, footer: { color: "#839087", textAlign: "center", fontSize: 10, marginTop: 20 }
});
