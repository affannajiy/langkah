import * as ImagePicker from 'expo-image-picker';

export type PickedPhoto = { uri: string; width: number };

// Camera or gallery. The camera permission is asked for only here. The gallery uses
// the system photo picker, so no storage permission is needed.
export async function pickPhoto(from: 'camera' | 'library'): Promise<PickedPhoto | 'denied' | null> {
  if (from === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return 'denied';
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result =
    from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width } : null;
}
