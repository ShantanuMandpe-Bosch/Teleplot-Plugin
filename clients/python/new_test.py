#send data in binary

import socket
import math
import time

teleplotAddr = ("127.0.0.1",47269)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def sendTelemetry(name, value):
	now = time.time() * 1000
	msg = str(1)+ " " + name + " "+ str(now) + " "+ str(now) + " "+ str(now) + " "+ str(now) + " " + str(value) + "|g"
	res = ' '.join(format(ord(i),'08b') for i in msg)
	print('The array is : ' +  str(res))
	sock.sendto(res.encode(), teleplotAddr)

i=0
while True:
	
	sendTelemetry("sin", math.sin(i))
	sendTelemetry("cos", math.cos(i))

	i+=0.1
	time.sleep(0.01)