import sys
import os

def convert_to_pdf(input_path, output_path):
    try:
        import win32com.client
        import pythoncom
        
        # Initialize COM in this thread
        pythoncom.CoInitialize()
        
        # Dispatch PowerPoint application
        powerpoint = win32com.client.Dispatch("Powerpoint.Application")
        
        # Open the presentation
        # WithWindow=False prevents the UI from showing up
        deck = powerpoint.Presentations.Open(input_path, WithWindow=False)
        
        # Save as PDF (format type 32)
        deck.SaveAs(output_path, 32)
        
        # Close and quit
        deck.Close()
        powerpoint.Quit()
        
        print(f"SUCCESS: {output_path}")
        return True
    except ImportError:
        print("ERROR: pywin32 is not installed. Run 'pip install pywin32'")
        return False
    except Exception as e:
        print(f"ERROR converting {input_path} to PDF: {str(e)}")
        try:
            powerpoint.Quit()
        except:
            pass
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("ERROR: Missing arguments. Usage: python convert_pptx.py <input> <output>")
        sys.exit(1)
        
    input_file = os.path.abspath(sys.argv[1])
    output_file = os.path.abspath(sys.argv[2])
    
    if not os.path.exists(input_file):
        print(f"ERROR: Input file does not exist: {input_file}")
        sys.exit(1)
        
    success = convert_to_pdf(input_file, output_file)
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
