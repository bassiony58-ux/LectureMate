import sys
import os
import json
import zipfile

def extract_images(pptx_path):
    images = []
    temp_dir = os.path.dirname(pptx_path)
    base_name = os.path.basename(pptx_path).split('.')[0]
    
    try:
        with zipfile.ZipFile(pptx_path, 'r') as archive:
            for item in archive.namelist():
                if item.startswith('ppt/media/') and item.lower().endswith(('.png', '.jpeg', '.jpg', '.gif')):
                    # Read file data
                    file_data = archive.read(item)
                    if len(file_data) < 15000: # skip small icons
                        continue
                    
                    filename = os.path.basename(item)
                    image_filename = f"{base_name}_{filename}"
                    image_filepath = os.path.join(temp_dir, image_filename)
                    
                    with open(image_filepath, "wb") as f:
                        f.write(file_data)
                    images.append(image_filepath)
                    
                    if len(images) >= 30: # Limit to max 30 images
                        break
    except Exception as e:
        pass
    
    return {"success": True, "images": images}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No PPTX path provided"}))
        sys.exit(1)
        
    pptx_path = sys.argv[1]
    result = extract_images(pptx_path)
    print(json.dumps(result))
