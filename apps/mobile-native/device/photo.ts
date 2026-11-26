import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { createDraftPhotoController, type PhotoPickerResult } from "./photo-controller";
import { isPhotoCacheFile, prepareDraftPhoto } from "./photo-image";

export { belongsToPhotoDraft } from "./photo-controller";
export type { DraftPhoto, PhotoDraftRequest, PhotoDraftTarget, PhotoOutcome, PhotoSource } from "./photo-controller";

const pendingKey = "zyx.expo-pending-photo.v1";
const storeOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const options: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: false,
  allowsMultipleSelection: false,
  quality: 1,
  base64: false,
  exif: false,
};

function privatePhotoFile(uri: string): File | null {
  return isPhotoCacheFile(uri, Paths.cache.uri, Platform.OS === "ios") ? new File(uri) : null;
}

function discard(uri: string) {
  try {
    const file = privatePhotoFile(uri);
    if (file?.exists) file.delete();
  } catch {
    // The picker and manipulator output are private cache files.
  }
}

function pickerResult(result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult): PhotoPickerResult {
  if ("code" in result) return { status: "error" };
  if (result.canceled) return { status: "cancelled" };
  if (result.assets.length === 1) return { status: "selected", asset: result.assets[0] };
  for (const asset of result.assets) discard(asset.uri);
  return { status: "error" };
}

export const scopedPhotos = createDraftPhotoController({
  createId: randomUUID,
  store: {
    read: () => SecureStore.getItemAsync(pendingKey, storeOptions),
    write: value => SecureStore.setItemAsync(pendingKey, value, storeOptions),
    remove: () => SecureStore.deleteItemAsync(pendingKey, storeOptions),
  },
  device: {
    available: Platform.OS === "android" || Platform.OS === "ios",
    supportsRecovery: Platform.OS === "android",
    checkCameraPermission: ImagePicker.getCameraPermissionsAsync,
    requestCameraPermission: ImagePicker.requestCameraPermissionsAsync,
    async launch(source) {
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      return pickerResult(result);
    },
    async getPending() {
      const result = await ImagePicker.getPendingResultAsync();
      return result ? pickerResult(result) : null;
    },
    prepare: asset => prepareDraftPhoto(asset, {
      fileSize(uri) {
        const file = privatePhotoFile(uri);
        return file?.exists ? file.size : null;
      },
      discard,
      async render(uri, resize) {
        const context = ImageManipulator.manipulate(uri);
        try {
          if (resize) context.resize(resize);
          const image = await context.renderAsync();
          return {
            save: (format, compress) => image.saveAsync({
              format: format === "jpeg" ? SaveFormat.JPEG : SaveFormat.PNG,
              compress,
            }),
            release() {
              image.release();
              context.release();
            },
          };
        } catch (error) {
          context.release();
          throw error;
        }
      },
    }),
    discard,
  },
});
