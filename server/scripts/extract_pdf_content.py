import sys
import json
import fitz  # PyMuPDF
import os

def extract_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    images = []
    
    # Store images in temp folder alongside the PDF
    temp_dir = os.path.dirname(pdf_path)
    base_name = os.path.basename(pdf_path).split('.')[0]
    
    image_count = 0
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        page_text = page.get_text()
        text += page_text + "\n"
        
        image_list = page.get_images(full=True)
        for img_index, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            
            # Avoid extracting very small images like icons/logos/bullets
            if len(image_bytes) < 15000:
                continue
                
            image_filename = f"{base_name}_p{page_num}_{img_index}.{image_ext}"
            image_filepath = os.path.join(temp_dir, image_filename)
            
            with open(image_filepath, "wb") as f:
                f.write(image_bytes)
                
            images.append(image_filepath)
            
            image_count += 1
            if image_count > 20: # Limit to max 20 images to prevent long processing
                break
        if image_count > 20:
            break
            
    return {
        "success": True,
        "transcript": text,
        "images": images
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No PDF path provided"}))
        sys.exit(1)
        
    # We must set PYTHONIOENCODING=utf-8 or similar, but stdout encoding is mostly handled
    # Reconfigure stdout to use utf-8
    sys.stdout.reconfigure(encoding='utf-8')
    pdf_path = sys.argv[1]
    
    try:
        result = extract_pdf(pdf_path)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
