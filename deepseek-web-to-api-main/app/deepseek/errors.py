class DeepSeekError(Exception):
    pass


class AuthError(DeepSeekError):
    pass


class PowError(DeepSeekError):
    pass


class UpstreamError(DeepSeekError):
    pass
