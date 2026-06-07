import pty
import os
import subprocess
import select
import sys
import time
import re

def main():
    master, slave = pty.openpty()
    
    # Spawn process with slave pty for stdin/stdout/stderr
    proc = subprocess.Popen(
        ["pnpm", "db:generate", "--name", "add_investments"],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        preexec_fn=os.setsid
    )
    
    # Close slave descriptor in parent as we don't need it
    os.close(slave)
    
    # Non-blocking read helper
    os.set_blocking(master, False)
    
    output_buffer = ""
    timeout = 40.0 # Max seconds to run (increased slightly to cover all prompts)
    start_time = time.time()
    
    # Track which subjects we have already sent an Enter key for
    answered_subjects = set()
    
    print("Spawning drizzle-kit generate in PTY...")
    
    # Regex to match Drizzle Kit interactive prompts for tables and columns
    # Example: "Is account_share_members table created or renamed from another table?"
    # Example: "Is privacy_mode column in user_settings table created or renamed..."
    prompt_regex = re.compile(
        r"Is\s+([\w.-]+)\s+(?:table|column).*?(?:created|added|or)\s+renamed", 
        re.IGNORECASE
    )
    
    try:
        while proc.poll() is None:
            if time.time() - start_time > timeout:
                print("\nTimeout reached, killing process...")
                proc.terminate()
                break
                
            r, w, x = select.select([master], [], [], 0.5)
            if master in r:
                try:
                    data = os.read(master, 1024).decode('utf-8', errors='ignore')
                    if data:
                        sys.stdout.write(data)
                        sys.stdout.flush()
                        output_buffer += data
                        
                        # Scan output buffer for prompts
                        matches = prompt_regex.findall(output_buffer)
                        for subject in matches:
                            if subject not in answered_subjects:
                                print(f"\n[PTY Wrapper] Detected new prompt for subject: '{subject}'. Answering Carriage Return (\\r)...")
                                os.write(master, b"\r")
                                answered_subjects.add(subject)
                                # Reset timeout start time on activity
                                start_time = time.time()
                except BlockingIOError:
                    pass
                except Exception as e:
                    print(f"\nRead error: {e}")
                    break
            time.sleep(0.05)
            
        # Read remaining output
        try:
            while True:
                data = os.read(master, 1024).decode('utf-8', errors='ignore')
                if not data:
                    break
                sys.stdout.write(data)
                sys.stdout.flush()
        except Exception:
            pass
            
        print(f"\nProcess exited with code {proc.returncode}")
        sys.exit(proc.returncode)
        
    except Exception as e:
        print(f"\nError: {e}")
        proc.terminate()
        sys.exit(1)

if __name__ == "__main__":
    main()
