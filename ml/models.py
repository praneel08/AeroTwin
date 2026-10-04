"""RUL regressors: 1D-CNN, LSTM, small Transformer. All use dropout so Monte Carlo dropout gives uncertainty."""
import numpy as np
import torch
import torch.nn as nn

N_SENSORS = 14


class CNN1D(nn.Module):
    def __init__(self, n_in=N_SENSORS, window=30, p=0.2):
        super().__init__()
        ch = [n_in, 32, 64, 64]
        layers = []
        for a, b in zip(ch[:-1], ch[1:]):
            layers += [nn.Conv1d(a, b, 5, padding=2), nn.BatchNorm1d(b), nn.ReLU(), nn.Dropout(p)]
        self.conv = nn.Sequential(*layers)
        self.head = nn.Sequential(nn.Flatten(), nn.Linear(64 * window, 100), nn.ReLU(), nn.Dropout(p), nn.Linear(100, 1))

    def forward(self, x):  # x: (B, T, F)
        return self.head(self.conv(x.transpose(1, 2))).squeeze(-1)


class LSTMReg(nn.Module):
    def __init__(self, n_in=N_SENSORS, hidden=64, layers=2, p=0.2):
        super().__init__()
        self.lstm = nn.LSTM(n_in, hidden, layers, batch_first=True, dropout=p)
        self.head = nn.Sequential(nn.Dropout(p), nn.Linear(hidden, 32), nn.ReLU(), nn.Linear(32, 1))

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.head(out[:, -1]).squeeze(-1)


class TransformerReg(nn.Module):
    def __init__(self, n_in=N_SENSORS, window=30, d=64, heads=4, layers=3, p=0.1):
        super().__init__()
        self.inp = nn.Linear(n_in, d)
        self.pos = nn.Parameter(torch.zeros(1, window, d))
        enc = nn.TransformerEncoderLayer(d, heads, 128, p, batch_first=True)
        self.enc = nn.TransformerEncoder(enc, layers)
        self.head = nn.Sequential(nn.Dropout(p), nn.Linear(d, 1))

    def forward(self, x):
        h = self.enc(self.inp(x) + self.pos)
        return self.head(h.mean(1)).squeeze(-1)


MODELS = {"cnn": CNN1D, "lstm": LSTMReg, "transformer": TransformerReg}


@torch.no_grad()
def predict(model, X, device, mc=0, bs=2048):
    """Deterministic prediction, or (mean, std) over `mc` Monte Carlo dropout passes."""
    def run():
        return torch.cat([model(torch.as_tensor(X[i:i + bs], device=device)).float().cpu()
                          for i in range(0, len(X), bs)]).numpy()
    if not mc:
        model.eval()
        return run()
    model.eval()
    for m in model.modules():  # only dropout stays stochastic; BatchNorm stays in eval mode
        if isinstance(m, nn.Dropout):
            m.train()
    s = np.stack([run() for _ in range(mc)])
    model.eval()
    return s.mean(0), s.std(0)
