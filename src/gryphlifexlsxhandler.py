from flask import Flask, request, jsonify
from flask_cors import CORS
import openpyxl

app = Flask(__name__)
CORS(app, resources={r"/receive_data": {"origins": "https://gryphlife.uoguelph.ca"}})

@app.route('/receive_data', methods=['POST'])
def receive_data():
    data = request.get_json(force=True)
    if data:
        print("Data received:", data)
        
        # Your Excel file path
        file_path = '/Users/manirashahmadi/ccode/Discord-Bot/src/Verification_Team_Roster.xlsx'
        
        # Load the workbook and select the first worksheet
        workbook = openpyxl.load_workbook(file_path)
        sheet = workbook.active
        
        # Assume names are in column A, find the first empty row in that column
        row = 1
        while sheet[f"A{row}"].value is not None:
            row += 1
        
        # Write the name to the first empty cell in column A
        name = data.get("Name")  # Assuming the key in your JSON object is "Name"
        if name:
            sheet[f"A{row}"] = name
        
        # Write the email to the first empty cell in column B
        email = data.get("email")  # Assuming the key in your JSON object is "email"
        if email:
            sheet[f"B{row}"] = email
        
        # Save the workbook
        workbook.save(file_path)
        
        return jsonify(status="Data received", data=data), 200
    else:
        print("No data received or not in expected format")
        return jsonify(status="No data received or not in expected format"), 400

if __name__ == "__main__":
    app.run(port=5000)
