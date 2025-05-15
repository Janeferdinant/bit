import time
import random

def sender(frames, timeout=2):
    print("Sender: Starting transmission")
    i = 0
    while i < len(frames):
        print(f"Sender: Sending frame {frames[i]}")
        # Simulate sending frame
        time.sleep(1)
        # Simulate ACK (randomly lost or received)
        if random.random() > 0.2:  # 80% chance ACK is received
            print(f"Sender: ACK for frame {frames[i]} received")
            i += 1
        else:
            print(f"Sender: Timeout for frame {frames[i]}, retransmitting")
            time.sleep(timeout)
    
    print("Sender: All frames sent successfully")

def receiver(frames):
    print("Receiver: Starting")
    for frame in frames:
        print(f"Receiver: Received frame {frame}")
        # Simulate sending ACK
        print(f"Receiver: Sending ACK for frame {frame}")
        time.sleep(0.5)

# Example usage
if __name__ == "__main__":
    frames = [1, 2, 3, 4, 5]
    print("Starting Stop-and-Wait Simulation")
    sender(frames)
