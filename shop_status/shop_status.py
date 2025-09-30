from flask import Flask, request, jsonify
import json
from waitress import serve

app = Flask(__name__)
SHOP_STATUS_FILE = "shop_status.json"
shop_status = ""

# Edit the JSON file by receiving payload from esp32 
@app.route('/update_shop_status', methods=['POST'])
def update_shop_status():
    global shop_status
    data = request.get_json(force=True)
    shop_status = data.get("shop-status", "")
    print("Received:", data)

    # Optional: save to file
    with open(SHOP_STATUS_FILE, "w") as f:
        json.dump(data, f)
    return jsonify({"status": "updated", "shop-status": shop_status}), 200

# For local development
if __name__ == "__main__":
    serve(app, host="0.0.0.0", port=5000)