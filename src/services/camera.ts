/**
 * Camera service — photo capture with file persistence.
 *
 * Uses expo-image-picker (simpler than expo-camera, no custom view needed).
 * Photos saved to app's document directory (survives offline).
 * Only file URI is stored in sync queue (NOT base64).
 *
 * PREBUILD NOTE: expo-image-picker works in Expo Go.
 * expo-camera requires custom dev client for advanced features.
 */

import * as ImagePicker from 'expo-image-picker';
// expo-file-system types vary by version; use namespace import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExpoFS = require('expo-file-system') as {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
  makeDirectoryAsync: (uri: string, opts?: { intermediates?: boolean }) => Promise<void>;
  copyAsync: (opts: { from: string; to: string }) => Promise<void>;
  readAsStringAsync: (uri: string, opts?: { encoding?: string }) => Promise<string>;
  deleteAsync: (uri: string, opts?: { idempotent?: boolean }) => Promise<void>;
  EncodingType: { Base64: string };
};

const PHOTO_DIR = `${ExpoFS.documentDirectory || ''}photos/`;

/**
 * Ensure photos directory exists.
 */
async function ensurePhotoDir(): Promise<void> {
  const dirInfo = await ExpoFS.getInfoAsync(PHOTO_DIR);
  if (!dirInfo.exists) {
    await ExpoFS.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

export interface CapturedPhoto {
  localUri: string;    // file:///... path to saved photo
  width: number;
  height: number;
  timestamp: number;
}

/**
 * Request camera permission and take a photo.
 * Saves to local filesystem and returns URI.
 *
 * Returns null if:
 *   - permission denied
 *   - user cancelled
 *   - camera error
 */
export async function takePhoto(): Promise<CapturedPhoto | null> {
  try {
    // Request permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[camera] Permission denied');
      return null;
    }

    // V1.2: Optimized for data savings
    // Quality 0.5 = ~200KB per photo (vs 0.7 = ~400KB, 1.0 = ~2MB)
    // Max 1280px width = enough for evidence, saves bandwidth
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.5,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const timestamp = Date.now();

    // Save to persistent directory
    await ensurePhotoDir();
    const filename = `photo_${timestamp}.jpg`;
    const destUri = `${PHOTO_DIR}${filename}`;

    await ExpoFS.copyAsync({
      from: asset.uri,
      to: destUri,
    });

    return {
      localUri: destUri,
      width: asset.width,
      height: asset.height,
      timestamp,
    };
  } catch (error) {
    console.error('[camera] Error:', error);
    return null;
  }
}

/**
 * Read a photo as base64 (only for upload to server).
 * NOT for storing in queue — use localUri instead.
 */
export async function readPhotoAsBase64(localUri: string): Promise<string | null> {
  try {
    const base64 = await ExpoFS.readAsStringAsync(localUri, {
      encoding: ExpoFS.EncodingType.Base64,
    });
    return base64;
  } catch {
    return null;
  }
}

/**
 * Delete a photo from local storage.
 */
export async function deletePhoto(localUri: string): Promise<void> {
  try {
    await ExpoFS.deleteAsync(localUri, { idempotent: true });
  } catch {
    // Ignore
  }
}

/**
 * Check camera permission status without requesting.
 */
export async function getCameraPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status } = await ImagePicker.getCameraPermissionsAsync();
  return status;
}
