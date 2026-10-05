class JobError(Exception):
    """A failure with a stable, user-safe code. Never include document content in messages."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code
