import React from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewStyle
} from 'react-native';
import { C } from '../theme/colors';

export function HCText({ children, muted, big, style, numberOfLines }: {
  children: React.ReactNode; muted?: boolean; big?: boolean; style?: any; numberOfLines?: number;
}) {
  return <Text numberOfLines={numberOfLines} style={[styles.text, muted && { color: C.muted }, big && { fontSize: 24, fontWeight: '900' }, style]}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={C.muted} {...props} style={[styles.field, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} />;
}

export function Btn({ label, onPress, muted, danger, disabled, busy, style }: {
  label: string; onPress: () => void; muted?: boolean; danger?: boolean;
  disabled?: boolean; busy?: boolean; style?: ViewStyle;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress}
    style={[styles.btn, muted && { backgroundColor: C.panel2 }, danger && { backgroundColor: '#A92442' },
      disabled && { opacity: 0.5 }, style]}>
    {busy ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>{label}</Text>}
  </Pressable>;
}

export function Empty({ message }: {message: string}) {
  return <View style={{ padding: 28, alignItems: 'center' }}><HCText muted style={{ textAlign: 'center' }}>{message}</HCText></View>;
}

const styles = StyleSheet.create({
  text: { color: C.white, fontSize: 15 },
  field: { backgroundColor: C.panel, color: C.white, padding: 13, borderRadius: 14, borderColor: C.border, borderWidth: 1, marginBottom: 10, fontSize: 16 },
  btn: { backgroundColor: C.blue, paddingVertical: 14, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 14, marginBottom: 10 },
  btnText: { color: C.white, fontSize: 15, fontWeight: '800' },
});
