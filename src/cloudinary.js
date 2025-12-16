// ✅ src/cloudinary.js
// Helper for uploading images to Cloudinary (with folder support)

export const uploadToCloudinary = async (file, folder = "renthub") => {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", "renthub_unsigned"); // 🔁 must match your Cloudinary unsigned preset name
  formData.append("folder", folder); // 🔁 upload into this folder (e.g. renthub/profiles or renthub/rentals)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/djfwy78qk/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Cloudinary upload error:", data);
    throw new Error(data.error?.message || "Upload failed");
  }

  return data.secure_url; // ✅ direct URL to uploaded image
};
