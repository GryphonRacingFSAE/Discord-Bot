FROM python:3.12-slim

WORKDIR /app

COPY shop_status.py /app/

RUN pip install --no-cache-dir flask waitress

EXPOSE 5000

CMD ["python", "shop_status.py"]