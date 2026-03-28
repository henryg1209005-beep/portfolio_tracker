import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ui.app import PortfolioApp

if __name__ == "__main__":
    app = PortfolioApp()
    app.run()
